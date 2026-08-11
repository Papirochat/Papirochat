'use strict';
/* ═══════════════════════════════════════════════════
   P∆pir° Chat v5 — Centro de Mando: ∆luisalfonsocastillejo°

   NOTAS IMPORTANTES (léelas antes de producción real):
   1. Cifrado AES-GCM en cliente, no es E2E real persona-a-persona.
   2. pass_hash es SHA-256 del lado cliente — MVP, no autenticación de
      nivel producción. La Edge Function de EN VIVO sí revalida la
      contraseña en el servidor antes de emitir tokens de transmisión.
   3. RLS abierta en casi todo — la lógica de negocio vive en el cliente
      por ahora. Ver manual técnico para el plan de endurecimiento.
   4. La cuenta ∆luisalfonsocastillejo° (Centro de Mando) tiene INMUNIDAD
      TOTAL: nunca se modera, nunca caduca, nunca se borra por inactividad.
      Esto se aplica explícitamente en cada función relevante de abajo.
   ═══════════════════════════════════════════════════ */

var SBURL = 'https://kyzpqyjqdblscdpbeglg.supabase.co';
var SBKEY = 'sb_publishable_3y9GbOynwMqDy5UmvuyBeg_4N2Hm3TP';
var sb = null;
try {
  sb = window.supabase.createClient(SBURL, SBKEY, {
    auth:{ persistSession:false, autoRefreshToken:false, detectSessionInUrl:false }
  });
} catch(x){ console.error(x); }

var CEO_NOMBRE = '∆luisalfonsocastillejo°';
var EDGE_TOKEN_URL = SBURL + '/functions/v1/generar-token-live';

var SALAS = [
  {orden:1,nombre:'Caballo Blanco',meta:2250,seg:60},
  {orden:2,nombre:'Caballo Rojo',meta:4500,seg:120},
  {orden:3,nombre:'Caballo Negro',meta:9000,seg:240},
  {orden:4,nombre:'Caballo Verde',meta:18000,seg:480},
  {orden:5,nombre:'Ropas Blancas',meta:36000,seg:900},
  {orden:6,nombre:'Luna Roja',meta:72000,seg:1320},
  {orden:7,nombre:'Siete',meta:144000,seg:1800}
];

var U = { nombre:'', rol:'usuario', tema: localStorage.getItem('pc_tema')||'matrix' };
var SALA_ACTUAL = 1;
var TOTAL_USUARIOS_CACHE = 1;
var UM = { objetivo:'' };
var ultimoEnvioSeg = 0;
var pollTid=null, ultimoMsgId=null, actividadTid=null, cleanupTid=null;
var liveRoom = null, esBroadcaster = false, ultimoEnvioLiveSeg = 0, liveChatUltimoId = null, livePollTid = null;

function eqNombre(a,b){ return String(a||'').trim().toLowerCase() === String(b||'').trim().toLowerCase(); }
function esCEO(nombre){ return eqNombre(nombre, CEO_NOMBRE); }

setTema(U.tema, true);

/* ── CIFRADO ── */
async function claveDe(etiqueta){
  var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('papirochat-'+etiqueta));
  return buf;
}
async function cifrarConEtiqueta(texto, etiqueta){
  var buf = await claveDe(etiqueta);
  var key = await crypto.subtle.importKey('raw', buf, {name:'AES-GCM'}, false, ['encrypt']);
  var iv = crypto.getRandomValues(new Uint8Array(12));
  var enc = await crypto.subtle.encrypt({name:'AES-GCM', iv:iv}, key, new TextEncoder().encode(texto));
  return { c: btoa(String.fromCharCode(...new Uint8Array(enc))), iv: btoa(String.fromCharCode(...iv)) };
}
async function descifrarConEtiqueta(c64, iv64, etiqueta){
  try{
    var buf = await claveDe(etiqueta);
    var key = await crypto.subtle.importKey('raw', buf, {name:'AES-GCM'}, false, ['decrypt']);
    var c = Uint8Array.from(atob(c64), ch=>ch.charCodeAt(0));
    var iv = Uint8Array.from(atob(iv64), ch=>ch.charCodeAt(0));
    var dec = await crypto.subtle.decrypt({name:'AES-GCM', iv:iv}, key, c);
    return new TextDecoder().decode(dec);
  }catch(x){ return '[mensaje ilegible]'; }
}
async function cifrar(texto, orden){ return cifrarConEtiqueta(texto, 'sala-'+orden); }
async function descifrar(c64, iv64, orden){ return descifrarConEtiqueta(c64, iv64, 'sala-'+orden); }
async function hashPass(pass){
  var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('pc-salt-' + pass));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

/* ── TEMA ── */
function setTema(t){ U.tema=t; document.body.className=t; localStorage.setItem('pc_tema',t); }
function mostrarRegistro(){ document.getElementById('form-login').style.display='none'; document.getElementById('form-registro').style.display='flex'; }
function mostrarLogin(){ document.getElementById('form-registro').style.display='none'; document.getElementById('form-login').style.display='block'; }
function contarFilo(){ document.getElementById('filo-count').textContent = document.getElementById('rg-filo').value.length; }
function toggleOjo(inputId, ojoId){
  var inp = document.getElementById(inputId); var ojo = document.getElementById(ojoId);
  if(inp.type==='password'){ inp.type='text'; ojo.style.opacity=1; } else { inp.type='password'; ojo.style.opacity=.6; }
}
var IMG_BASE64 = '';
/* ── Compresión automática de imágenes ──
   Antes se rechazaban imágenes de más de 900KB tal cual venían del
   teléfono (fotos normales de cámara fácilmente pesan 3-8MB). Ahora se
   redimensionan (máx. 1280px de lado más largo) y se comprimen a JPEG
   calidad 87% ANTES de subirlas — el usuario ya no tiene que preocuparse
   por el peso, y la proporción original (vertical, horizontal, cuadrada)
   se mantiene intacta porque solo se reduce escala, nunca se recorta. */
function comprimirImagen(file){
  return new Promise(function(resolve, reject){
    if(!file.type.startsWith('image/')){ reject(new Error('No es una imagen')); return; }
    var reader = new FileReader();
    reader.onload = function(e){
      var img = new Image();
      img.onload = function(){
        var maxLado = 1280;
        var w = img.width, h = img.height;
        if(w > maxLado || h > maxLado){
          if(w >= h){ h = Math.round(h * (maxLado/w)); w = maxLado; }
          else { w = Math.round(w * (maxLado/h)); h = maxLado; }
        }
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.87));
      };
      img.onerror = function(){ reject(new Error('No se pudo leer la imagen')); };
      img.src = e.target.result;
    };
    reader.onerror = function(){ reject(new Error('No se pudo leer el archivo')); };
    reader.readAsDataURL(file);
  });
}

async function previsualizarImagen(){
  var file = document.getElementById('rg-img-input').files[0];
  if(!file) return;
  try{
    IMG_BASE64 = await comprimirImagen(file);
    document.getElementById('rg-img-preview').src = IMG_BASE64;
  }catch(x){ alert('No se pudo procesar la imagen. Prueba con otra.'); }
}

