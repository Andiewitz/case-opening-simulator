import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, runTransaction, collection, onSnapshot, query, orderBy, where, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/// DB Service

export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}

export async function logout() {
  return signOut(auth);
}

export async function getUserProfile(userId: string) {
  try {
    const docRef = doc(db, 'users', userId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      // Create it
      const newProfile = {
        email: auth.currentUser?.email || "",
        balance: 100, // starting balance
        stats: {
          casesOpened: 0,
          totalSpent: 0,
          totalValue: 0,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(docRef, newProfile);
      return { id: userId, ...newProfile, isNew: true };
    }
    return { id: snap.id, ...snap.data() };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${userId}`);
  }
}

export async function openCaseAndUpdateBalance(userId: string, caseCost: number, itemWon: any) {
    try {
        const newItemRef = doc(collection(db, 'users', userId, 'inventory'));
        const userRef = doc(db, 'users', userId);
        
        let newItemInfo: any = {};
        
        await runTransaction(db, async (transaction) => {
            const userSnap = await transaction.get(userRef);
            if(!userSnap.exists()) throw new Error("User not found");
            
            const userData = userSnap.data();
            if(userData.balance < caseCost) {
                throw new Error("Insufficient balance");
            }
            
            let rarityName = itemWon.rarity?.name || itemWon.rarity || "Base Grade";
            let colorHex = itemWon.rarity?.color || itemWon.color || "#b0c3d9";
            
            const newItem = {
                userId: userId,
                name: itemWon.name,
                rarity: rarityName,
                color: colorHex,
                image: itemWon.image || "",
                price: itemWon.price || 0,
                condition: itemWon.condition || "Factory New",
                isStatTrak: itemWon.isStatTrak || false,
                pattern: itemWon.pattern || 1,
                float: itemWon.float || 0.05,
                phase: itemWon.phase || null,
                createdAt: serverTimestamp()
            };
            
            transaction.set(newItemRef, newItem);
            
            transaction.update(userRef, {
                balance: userData.balance - caseCost,
                'stats.casesOpened': userData.stats.casesOpened + 1,
                'stats.totalSpent': userData.stats.totalSpent + caseCost,
                'stats.totalValue': userData.stats.totalValue + (newItem.price || 0),
                updatedAt: serverTimestamp()
            });
            
            newItemInfo = newItem;
        });
        
        return { id: newItemRef.id, ...newItemInfo };
    } catch(e) {
        handleFirestoreError(e, OperationType.WRITE, `users/${userId}/inventory`);
    }
}

export async function sellItem(userId: string, itemId: string, price: number) {
     try {
        const itemRef = doc(db, 'users', userId, 'inventory', itemId);
        const userRef = doc(db, 'users', userId);
        
        await runTransaction(db, async (transaction) => {
            const itemSnap = await transaction.get(itemRef);
            if (!itemSnap.exists()) {
                throw new Error("Item not found or already sold.");
            }
            const userSnap = await transaction.get(userRef);
            if(!userSnap.exists()) throw new Error("User not found");
            const userData = userSnap.data();
            
            transaction.delete(itemRef);
            transaction.update(userRef, {
                balance: userData.balance + price,
                // perhaps track stats for sold?
                updatedAt: serverTimestamp()
            });
        });
     } catch(e) {
        handleFirestoreError(e, OperationType.DELETE, `users/${userId}/inventory/${itemId}`);
     }
}

export function subscribeToInventory(userId: string, callback: (items: any[]) => void) {
    const q = query(
        collection(db, 'users', userId, 'inventory'), 
        where('userId', '==', userId)
    );
    return onSnapshot(q, (snap) => {
        const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        items.sort((a: any, b: any) => {
            const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return timeB - timeA;
        });
        callback(items);
    }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `users/${userId}/inventory`);
    });
}

export function subscribeToUser(userId: string, callback: (user: any) => void) {
    const docRef = doc(db, 'users', userId);
    return onSnapshot(docRef, (snap) => {
        if(snap.exists()) {
            callback({ id: snap.id, ...snap.data() });
        }
    }, (error) => {
        handleFirestoreError(error, OperationType.GET, `users/${userId}`);
    });
}
