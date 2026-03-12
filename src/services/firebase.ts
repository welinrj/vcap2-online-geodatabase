import { initializeApp } from 'firebase/app'
import { getFirestore, enableMultiTabIndexedDbPersistence } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyB2OGgiXUUhyt1aKdHsqIaMS3NDN-tZOdU',
  authDomain: 'vanuatu-nbsap-dashboard-9909a.firebaseapp.com',
  projectId: 'vanuatu-nbsap-dashboard-9909a',
  storageBucket: 'vanuatu-nbsap-dashboard-9909a.firebasestorage.app',
  messagingSenderId: '778670993904',
  appId: '1:778670993904:web:219c671804326d953aed35',
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)

// Enable offline persistence so data is cached locally and syncs across tabs/devices
enableMultiTabIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('Firestore persistence unavailable: multiple tabs open')
  } else if (err.code === 'unimplemented') {
    console.warn('Firestore persistence not supported in this browser')
  }
})
