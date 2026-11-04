import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { CognitoIdentityProviderClient, GetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { FakeDynamo } from "./fakeDynamo";
import { TABLE_INVENTORY, TABLE_USERS } from "../../backend/src/shared/utils";

export type Harness = {
  db: FakeDynamo;
  /** Every subsequent authenticated request resolves to this user id. */
  authAs: (userId: string) => void;
  reset: () => void;
};

/**
 * Installs the fakes against the client classes the handlers already imported.
 * aws-sdk-client-mock patches the class prototype, so singletons created at
 * module load (docClient, cognitoClient) still route through here.
 */
export function createHarness(): Harness {
  const db = new FakeDynamo({
    [TABLE_USERS]: ["userId"],
    [TABLE_INVENTORY]: ["userId", "itemId"],
  });

  const ddb = mockClient(DynamoDBDocumentClient);
  ddb.on(GetCommand).callsFake((input: any) => db.get(input));
  ddb.on(PutCommand).callsFake((input: any) => db.put(input));
  ddb.on(UpdateCommand).callsFake((input: any) => db.update(input));
  ddb.on(DeleteCommand).callsFake((input: any) => db.delete(input));
  ddb.on(QueryCommand).callsFake((input: any) => db.query(input));
  ddb.on(TransactWriteCommand).callsFake((input: any) => db.transact(input.TransactItems));

  let currentUser = "user-1";
  const cognito = mockClient(CognitoIdentityProviderClient);
  cognito.on(GetUserCommand).callsFake(async () => ({ Username: currentUser }));

  return {
    db,
    authAs: (userId: string) => {
      currentUser = userId;
    },
    reset: () => {
      ddb.reset();
      cognito.reset();
      currentUser = "user-1";
    },
  };
}

/** Minimal API Gateway proxy event. */
export function apiEvent(overrides: Record<string, any> = {}) {
  return {
    httpMethod: "POST",
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: JSON.stringify({}),
    queryStringParameters: null,
    requestContext: { requestId: "test-request" },
    ...overrides,
  };
}

export const TABLES = { users: TABLE_USERS, inventory: TABLE_INVENTORY };
