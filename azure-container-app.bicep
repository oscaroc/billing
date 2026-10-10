@description('Azure region for the billing application')
param location string = resourceGroup().location

@description('Existing production Container Apps environment')
param environmentName string = 'nivora-prod-cae'

@description('Existing production Azure Container Registry')
param registryName string = 'nivoraprodacr'

@description('Existing Azure SQL logical server')
param sqlServerName string = 'nivora-prod-sql2'

param databaseName string = 'nivora-billing-prod'
param appName string = 'nivora-billing-prod-app'
param identityName string = 'nivora-billing-prod-id'
param imageTag string

var commonTags = {
  Application: 'Billing'
  Environment: 'Production'
  Owner: 'Nivora'
  CostCenter: 'Billing'
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: registryName
}

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: environmentName
}

resource sqlServer 'Microsoft.Sql/servers@2023-08-01-preview' existing = {
  name: sqlServerName
}

resource billingDatabase 'Microsoft.Sql/servers/databases@2023-08-01-preview' = {
  parent: sqlServer
  name: databaseName
  location: location
  tags: commonTags
  sku: {
    name: 'Basic'
    tier: 'Basic'
    capacity: 5
  }
  properties: {
    // Basic caps at 2GB. Billing data was 25MB after a year; serverless
    // General Purpose never auto-paused (health probes poll every 10s) so it
    // billed the premium vCore rate 24/7 for 0% CPU.
    maxSizeBytes: 2147483648
    requestedBackupStorageRedundancy: 'Local'
    zoneRedundant: false
  }
}

resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
  tags: commonTags
}

resource pullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(appIdentity.id, registry.id, 'acr-pull')
  scope: registry
  properties: {
    principalId: appIdentity.properties.principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
    principalType: 'ServicePrincipal'
  }
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  tags: commonTags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${appIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          server: registry.properties.loginServer
          identity: appIdentity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'billing'
          image: '${registry.properties.loginServer}/nivora-billing:${imageTag}'
          env: [
            { name: 'AZURE_CLIENT_ID', value: appIdentity.properties.clientId }
            { name: 'SQL_SERVER', value: '${sqlServerName}${az.environment().suffixes.sqlServerHostname}' }
            { name: 'SQL_DATABASE', value: billingDatabase.name }
            { name: 'RUN_BILLING_MIGRATIONS', value: '1' }
            { name: 'ENFORCE_BILLING_ROLES', value: '1' }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/api/health', port: 8080 }
              initialDelaySeconds: 60
              periodSeconds: 30
              timeoutSeconds: 30
              failureThreshold: 5
            }
            {
              type: 'Readiness'
              httpGet: { path: '/api/health', port: 8080 }
              initialDelaySeconds: 10
              periodSeconds: 10
              timeoutSeconds: 30
              failureThreshold: 6
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [
          {
            name: 'http-scaling'
            http: { metadata: { concurrentRequests: '50' } }
          }
        ]
      }
    }
  }
  dependsOn: [pullRole]
}

output applicationUrl string = 'https://${app.properties.configuration.ingress.fqdn}'
output applicationFqdn string = app.properties.configuration.ingress.fqdn
output identityClientId string = appIdentity.properties.clientId
output identityPrincipalId string = appIdentity.properties.principalId
output identityResourceId string = appIdentity.id
output database string = billingDatabase.name
