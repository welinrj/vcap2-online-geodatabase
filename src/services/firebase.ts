/**
 * Re-export Firestore instance from the central config.
 *
 * Several stores (datasetStore, protectedAreaStore, prodocStore, userStore)
 * import `db` from this file.  Previously it duplicated the Firebase
 * initialisation and used the removed `enableMultiTabIndexedDbPersistence`
 * API.  Now it simply re-exports from `../config/firebase` so there is
 * a single Firebase app instance.
 */
export { db } from '../config/firebase'
