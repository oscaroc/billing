import assert from "node:assert/strict";
import test from "node:test";
import { signInUrl } from "../lib/auth-fetch.ts";

test("builds an Entra login URL that returns to the current application screen",()=>{
  assert.equal(signInUrl("/?section=customers#contracts"),"/.auth/login/aad?post_login_redirect_uri=%2F%3Fsection%3Dcustomers%23contracts");
});
