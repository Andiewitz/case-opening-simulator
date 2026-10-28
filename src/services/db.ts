export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export async function signIn() {
  return undefined;
}

export async function logout() {
  return undefined;
}

export async function getUserProfile(_userId: string) {
  return null;
}

export async function openCaseAndUpdateBalance(_userId: string, _caseCost: number, _itemWon: any) {
  return null;
}

export async function sellItem(_userId: string, _itemId: string, _price: number) {
  return undefined;
}

export function subscribeToInventory(_userId: string, _callback: (items: any[]) => void) {
  return () => undefined;
}

export function subscribeToUser(_userId: string, _callback: (user: any) => void) {
  return () => undefined;
}
