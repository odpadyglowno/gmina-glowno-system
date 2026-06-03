import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyBuuzbs5EV8FUWeP234d51sne5aXTvgtw0",
  authDomain: "gmina-glowno.firebaseapp.com",
  projectId: "gmina-glowno",
  storageBucket: "gmina-glowno.firebasestorage.app",
  messagingSenderId: "891642263058",
  appId: "1:891642263058:web:5892b802e12fe91fedcacb",
  measurementId: "G-4JLD4MM96V"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
