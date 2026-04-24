import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCifXZgS1KB_QdX-jR4FnPgGaNH3GGSXPE",
  authDomain: "harvestpulse-28de0.firebaseapp.com",
  projectId: "harvestpulse-28de0",
  storageBucket: "harvestpulse-28de0.firebasestorage.app",
  messagingSenderId: "999807515016",
  appId: "1:999807515016:web:d4bb39b41cb33d05ee623d"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);