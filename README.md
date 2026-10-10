# Nivora Billing

Accounts Receivable and Subscription Billing for Nivora. The application uses Azure SQL for shared customer and invoice persistence and managed identity authentication without database passwords.

## Run locally

```bash
npm install
npm run dev
```

## Build the container

```bash
docker build -t nivora-billing:latest .
docker run --rm -p 8080:8080 nivora-billing:latest
```

## Deploy to Nivora production

```bash
az login
TAG=$(date -u +%Y%m%d-%H%M%S)
az acr build --registry nivoraprodacr --image nivora-billing:$TAG .
az deployment group create --resource-group rg-nivora-prod \
  --template-file azure-container-app.bicep --parameters imageTag=$TAG
```

The deployment reuses `nivoraprodacr`, `nivora-prod-cae`, and the
`nivora-prod-sql2` logical server. It creates the isolated
`nivora-billing-prod` Basic-tier database, `nivora-billing-prod-id` managed
identity, and `nivora-billing-prod-app` Container App in `rg-nivora-prod`.

## Production follow-on

Customer, invoice, payment, and audit records are stored in the dedicated
`nivora-billing-prod` database. Microsoft Entra authentication and billing app
roles are enforced in production. Server-side email delivery, automatic tax
calculation, and Stripe webhooks remain follow-on work.
