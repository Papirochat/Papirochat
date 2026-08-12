'use strict';

/* ── REGISTRO ── */
async function registrar(){
  var nombre = document.getElementById('rg-user').value.trim();
  var pass = document.getElementById('rg-pass').value;
  var pass2 = document.getElementById('rg-pass2').value;
  var referido = document.getElementById('rg-referido').value.trim();
  var filo = document.getElementById('rg-filo').value.trim();
  var bitchat = document.getElementById('rg-bitchat').value.trim();
  var briar = document.getElementById('rg-briar').value.trim();
  var err = document.getElementById('reg-err');

  if(!/^∆.+°$/.test(nombre)){ err.textContent='El nombre debe llevar ∆ al inicio y ° al final. Ej: ∆tunombre°'; return; }
  if(pass.length<6){ err.textContent='Contraseña mínimo 6 caracteres'; return; }
  if(pass!==pass2){ err.textContent='Las dos contraseñas no coinciden'; return; }
  if(filo.length>777){ err.textContent='La filosofía no puede pasar de 777 caracteres'; return; }
  
  err.textContent='Verificando disponibilidad...';
  var passHash = await hashPass(pass);

  try{
    // 1. Verificación inicial de disponibilidad
    var {data:existente} = await sb.from('pc_usuarios').select('nombre, pass_hash').ilike('nombre',nombre).maybeSingle();
    
    if(existente){
      // ARREGLO DE SEGURIDAD: Si el nombre existe, verificamos si es del mismo usuario (por fallo de red previo)
      if(existente.pass_hash === passHash) {
        // Es el mismo usuario, lo dejamos entrar directamente
        err.textContent='';
        U.nombre = existente.nombre;
        var {data:userFull} = await sb.from('pc_usuarios').select('rol').ilike('nombre',U.nombre).single();
        U.rol = userFull.rol;
        sessionStorage.setItem('pc_nombre', U.nombre);
        entrarApp();
        return;
      } else {
        err.textContent='Ese nombre ya está en uso por otra persona.';
        return;
      }
    }
  }catch(x){
    console.warn('Fallo en verificación previa, intentando inserción directa...');
  }

  err.textContent='Creando cuenta...';
  var rol = esCEO(nombre) ? 'centro_mando' : 'usuario';

  try{
    var {error} = await sb.from('pc_usuarios').insert({
      nombre:nombre, pass_hash:passHash,
      imagen_url: (typeof IMG_BASE64 !== 'undefined' && IMG_BASE64) ? IMG_BASE64 : null,
      filosofia: filo||null,
      filosofia_editada_en: filo ? new Date().toISOString() : null,
      bitchat_id:bitchat||null, briar_id:briar||null,
      referido_por: referido||null, rol:rol,
      ultima_actividad: new Date().toISOString()
    });

    if(error){
      // Si el error es por duplicado, aplicamos la validación de seguridad de nuevo
      if(error.message.includes('duplicate')) {
        var {data:reverif} = await sb.from('pc_usuarios').select('nombre, pass_hash').ilike('nombre',nombre).maybeSingle();
        if(reverif && reverif.pass_hash === passHash) {
          err.textContent='';
          U.nombre = reverif.nombre;
          var {data:userFull2} = await sb.from('pc_usuarios').select('rol').ilike('nombre',U.nombre).single();
          U.rol = userFull2.rol;
          sessionStorage.setItem('pc_nombre', U.nombre);
          entrarApp();
          return;
        } else {
          err.textContent = 'Ese nombre ya está en uso.';
          return;
        }
      }
      err.textContent = 'Error: ' + error.message; 
      return; 
    }

    if(referido){
      await sb.from('pc_referidos_log').insert({ referidor:referido, referido:nombre }).catch(()=>{});
      await sb.rpc('pc_recalcular_referidos', {p_nombre:referido}).catch(()=>{});
      await sb.from('pc_notificaciones').insert({usuario_destino:referido, tipo:'sistema', contenido: nombre+' se registró usando tu invitación.'}).catch(()=>{});
    }
    
    err.textContent='';
    U.nombre = nombre; U.rol = rol;
    sessionStorage.setItem('pc_nombre', nombre);
    mostrarNotaBienvenida();
  }catch(x){ 
    err.textContent='Error de conexión. Si crees que la cuenta se creó, intenta iniciar sesión.'; 
  }
}

function mostrarNotaBienvenida(){
  alert(
    'P∆pir°Chat es una asamblea digital y anónima: un espacio ciudadano donde, a través del debate y los distintos puntos de vista, se busca acercarse a una verdad compartida sobre asuntos de interés público y colectivo.\n\n' +
    'Como toda asamblea activa, tu presencia importa: tu voz y la de cada integrante construyen el resultado. Por eso, si notamos una inactividad mayor a 96 horas, tu cuenta y tu nombre de usuario dejarán de existir, liberando ese nombre para alguien más — tendrías que crear una cuenta nueva para volver a participar.\n\n' +
    'Los 70 usuarios con más referidos podrán escribirle libremente al C.E.O. Los demás recibirán su mensaje si él nota su aporte al debate.\n\n' +
    'Te invitamos a esforzarte por mantener viva esta comunidad, para el bien común a través de esta herramienta digital.'
  );
  entrarApp();
}

/* ── LOGIN ── */
async function iniciarSesion(){
  var nombre = document.getElementById('li-user').value.trim();
  var pass = document.getElementById('li-pass').value;
  var err = document.getElementById('login-err');
  if(!nombre||!pass){ err.textContent='Completa ambos campos'; return; }
  err.textContent='Verificando...';
  var passHash = await hashPass(pass);
  try{
    var {data,error} = await sb.from('pc_usuarios').select('nombre,rol,estado,silenciado_hasta,expulsado_hasta').ilike('nombre',nombre).eq('pass_hash',passHash).maybeSingle();
    if(error || !data){ err.textContent='Usuario o contraseña incorrectos'; return; }
    if(data.estado==='expulsado_perm'){ err.textContent='Esta cuenta fue expulsada permanentemente'; return; }
    if(data.estado==='eliminado' || data.estado==='caducada_inasistencia'){ err.textContent='Esta cuenta fue eliminada por inasistencia. Crea una cuenta nueva.'; return; }
    err.textContent='';
    U.nombre = data.nombre; U.rol = data.rol;
    sessionStorage.setItem('pc_nombre', data.nombre);
    await sb.from('pc_usuarios').update({ultima_actividad:new Date().toISOString()}).ilike('nombre',data.nombre);
    entrarApp();
  }catch(x){ err.textContent='Error de conexión'; }
}

/* ── ENTRAR A LA APP ── */
async function entrarApp(){
  document.getElementById('login').style.display='none';
  document.getElementById('app-screen').style.display='flex';
  
  // Ajuste de visibilidad de menús según rol
  if(document.getElementById('menu-banner')) document.getElementById('menu-banner').style.display = (U.rol==='centro_mando') ? 'flex' : 'none';
  if(document.getElementById('menu-transmision')) document.getElementById('menu-transmision').style.display = (U.rol==='centro_mando') ? 'flex' : 'none';
  if(document.getElementById('menu-crear-link-mod')) document.getElementById('menu-crear-link-mod').style.display = (U.rol==='centro_mando') ? 'flex' : 'none';

  // Carga de datos iniciales
  if(typeof actualizarTotalUsuarios === 'function') await actualizarTotalUsuarios();
  if(typeof salaMasAltaDesbloqueada === 'function') await cambiarSala(salaMasAltaDesbloqueada());
  if(typeof actualizarBadgeContactos === 'function') actualizarBadgeContactos();
  if(typeof actualizarBadgeNotificaciones === 'function') actualizarBadgeNotificaciones();
  if(typeof cargarBanner === 'function') { cargarBanner(); setInterval(cargarBanner, 30000); }

  // Procesos de fondo
  if(typeof pollEstadoLive === 'function') { pollEstadoLive(); if(typeof livePollTid !== 'undefined') livePollTid = setInterval(pollEstadoLive, 5000); }
  
  // Actividad y Limpieza
  setInterval(marcarActividad, 60000);
  setInterval(limpiarCuentasInactivas, 120000);
  limpiarCuentasInactivas(); 
}

async function marcarActividad(){
  try{ await sb.from('pc_usuarios').update({ultima_actividad:new Date().toISOString()}).ilike('nombre',U.nombre); }catch(x){}
}

/* ── CADUCIDAD POR INASISTENCIA (96h → marcar, +72h → borrar de verdad) ── */
async function limpiarCuentasInactivas(){
  try{
    var corte96 = new Date(Date.now() - 96*3600*1000).toISOString();
    var {data:inactivos} = await sb.from('pc_usuarios').select('nombre').lt('ultima_actividad',corte96).eq('estado','activo');
    for(var i=0;i<(inactivos||[]).length;i++){
      if(typeof esCEO === 'function' && esCEO(inactivos[i].nombre)) continue; 
      await sb.from('pc_usuarios').update({estado:'caducada_inasistencia', caducada_en:new Date().toISOString()}).eq('nombre',inactivos[i].nombre);
    }
    var corte72 = new Date(Date.now() - 72*3600*1000).toISOString();
    var {data:paraBorrar} = await sb.from('pc_usuarios').select('nombre').eq('estado','caducada_inasistencia').lt('caducada_en',corte72);
    for(var j=0;j<(paraBorrar||[]).length;j++){
      if(typeof esCEO === 'function' && esCEO(paraBorrar[j].nombre)) continue;
      await sb.from('pc_usuarios').delete().eq('nombre',paraBorrar[j].nombre);
    }
  }catch(x){}
}

/* ── FUNCIÓN PARA ABRIR SEÑA CROMÁTICA DESDE EL MENÚ ── */
function abrirSeñaCromatica(){
  // Corregido: Apunta a sng.html como pidió el usuario
  window.location.href = 'sng.html?modo=registro&usuario=' + encodeURIComponent(U.nombre);
    }
