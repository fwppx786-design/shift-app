// ============================================================
// ★ ここにFirebaseの設定を貼り付けてください ★
// Firebase Console → プロジェクト設定 → マイアプリ → SDK設定
// ============================================================
import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

firebaseConfig = {
  apiKey: "AIzaSyCFTuDXbLJWB4oO5izWJaM-AluOxuWFbrQ",
  authDomain: "shift-e619d.firebaseapp.com",
  projectId: "shift-e619d",
  storageBucket: "shift-e619d.firebasestorage.app",
  messagingSenderId: "351780956985",
  appId: "1:351780956985:web:04af00551c31d6c499d6e8",
  measurementId: "G-0NCM21E7S1"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
