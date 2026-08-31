// Genera un par de llaves VAPID para Web Push. Correr una sola vez por
// proyecto (no por dispositivo ni por deploy) -- las mismas llaves
// sirven para todas las usuarias.
//
// Uso: node scripts/generate-vapid.js
import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log(`
Llaves VAPID generadas. Guárdalas -- si las pierdes, todas las
suscripciones push existentes dejan de funcionar y cada usuaria tiene
que volver a activar sus recordatorios.

1) Pega esto en tu .env (y en las variables de entorno de donde
   despliegues el frontend, ej. GitHub Pages no las necesita porque el
   build las incorpora, pero sí las necesitas en local):

VITE_VAPID_PUBLIC_KEY=${publicKey}

2) Sube la llave privada como secreto de Supabase (nunca al frontend,
   nunca a git) -- corre esto en la raíz del proyecto:

supabase secrets set VAPID_PRIVATE_KEY=${privateKey}
supabase secrets set VAPID_PUBLIC_KEY=${publicKey}
supabase secrets set VAPID_SUBJECT=mailto:tu-correo@ejemplo.com

   (VAPID_SUBJECT es un contacto que los proveedores push pueden usar
   si necesitan avisarte algo sobre tu uso del servicio -- pon un correo
   real que revises.)
`);
