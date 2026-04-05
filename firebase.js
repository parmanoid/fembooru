import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAu8tzzrqKizHt2_0_-6r6DJU02szqtgEA",
  authDomain: "fir-3fa84.firebaseapp.com",
  databaseURL: "https://fir-3fa84-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "fir-3fa84",
  storageBucket: "fir-3fa84.firebasestorage.app",
  messagingSenderId: "725404219596",
  appId: "1:725404219596:web:34ab5087aeed5b9bb1aa69"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

export const nickToEmail = (nick) => `${nick}@anon.ru`;
