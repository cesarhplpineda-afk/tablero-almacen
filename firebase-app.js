import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, setDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB3ciId5MIUBuV7e0EhA5yPDvY_AVRZBvo",
  authDomain: "tablero-sfor.firebaseapp.com",
  projectId: "tablero-sfor",
  storageBucket: "tablero-sfor.firebasestorage.app",
  messagingSenderId: "708464208254",
  appId: "1:708464208254:web:43f64c73669ea1bd302b2f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const DOC_REF = doc(db, "tablero", "estado");

window.tableroDB = {
  async guardar(estado){
    await setDoc(DOC_REF, estado);
  },
  suscribirse(callback){
    onSnapshot(DOC_REF, (snap) => {
      if(snap.exists()){
        callback(snap.data());
      } else {
        callback(null);
      }
    }, (error) => {
      console.error("Error de Firestore:", error);
    });
  }
};

const script = document.createElement("script");
script.src = "app-logic.js";
script.onload = () => {
  window.iniciarTablero();
};
document.body.appendChild(script);
