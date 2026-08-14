'use strict';

/* ══ ∆Notificación° (se autoborran a las 48h) ══ */
async function abrirNotificaciones(){
  cerrarOverlay('menu-overlay');
  var cont = document.getElementById('notif-content');
  cont.innerHTML='Cargando...';
  document.getElementById('notif-overlay').classList.add('on');

  await limpiarNotificacionesExpiradas();

  try{
    var {data} = await sb.from('pc_notificaciones').select('*').eq('usuario_destino',U.nombre).order('creado_en',{ascending:false}).limit(50);

    var html = '<div class="card-header">∆Notificación°</div>';

    if(!data || !data.length){
      html += '<div class="lista-fila" style="opacity:.6;">No tienes notificaciones.</div>';
    } else {
      data.forEach(function(n){
        var expiraMs = new Date(n.creado_en).getTime() + 48*3600*1000;
        html += '<div class="lista-fila" style="flex-direction:column;align-items:flex-start;gap:4px;">'+
          '<div>'+escHtml(n.contenido)+'</div>'+
          (n.tipo==='solicitud_ecosistema' ? '<div><span class="accion" onclick="responderSolicitudEcosistema('+n.id+',true)">✔ aceptar</span> <span class="accion" onclick="responderSolicitudEcosistema('+n.id+',false)">✕ rechazar</span></div>' : '')+
          '<div class="msg-caduca" style="font-size:9px;opacity:.5;" data-expira="'+expiraMs+'"></div></div>';
      });
    }

    cont.innerHTML = html;
    cont.querySelectorAll('.msg-caduca').forEach(actualizarUnTemporizador);

    /* ══ ARREGLO: el número de la campanita ya no se queda pegado ══
       Antes se contaban TODAS las notificaciones (leídas o no). Ahora,
       al abrir esta ventana, se marcan como leídas las que llegaron a tu
       nombre. La notificación en sí sigue viva hasta cumplir sus 48h —
       solo desaparece el número rojo de la campana. */
    await sb.from('pc_notificaciones').update({leido:true}).eq('usuario_destino',U.nombre).eq('leido',false);

  }catch(x){ cont.innerHTML='Error al cargar'; }

  actualizarBadgeNotificaciones();
}

/* ══ DM ══ */
var DM_ACTUAL = '';
async function abrirDMBandeja(){ alert('Toca el nombre o la foto de cualquier usuario en la sala, o entra a su perfil, y elige "Enviar mensaje".'); }

async function abrirDM(nombre){
  cerrarOverlay('perfil-overlay'); cerrarOverlay('user-menu-overlay'); cerrarOverlay('menu-overlay');
  DM_ACTUAL = nombre;
  document.getElementById('dm-header').textContent = 'Mensaje a '+nombre;
  document.getElementById('dm-msgs').innerHTML='Cargando...';
  document.getElementById('dm-overlay').classList.add('on');
  await cargarDM();
}

async function cargarDM(){
  try{
    await limpiarDMExpirados();
    var {data} = await sb.from('pc_dm').select('*')
      .or('and(de_usuario.ilike.'+U.nombre+',para_usuario.ilike.'+DM_ACTUAL+'),and(de_usuario.ilike.'+DM_ACTUAL+',para_usuario.ilike.'+U.nombre+')')
      .order('creado_en',{ascending:true}).limit(60);

    var cont = document.getElementById('dm-msgs');
    cont.innerHTML='';

    for(var i=0;i<(data||[]).length;i++){
      var m = data[i];
      var texto = await descifrarConEtiqueta(m.contenido_cifrado, m.iv, 'dm-'+[m.de_usuario.toLowerCase(),m.para_usuario.toLowerCase()].sort().join('-'));
      var expiraMs = new Date(m.creado_en).getTime() + 72*3600*1000;

      var div = document.createElement('div');
      div.className='msg '+(eqNombre(m.de_usuario,U.nombre)?'mio':'otro');
      div.innerHTML = '<div class="msg-burbuja">'+escHtml(texto)+'</div><div class="msg-time">se borra en <span class="msg-caduca" data-expira="'+expiraMs+'"></span></div>';
      cont.appendChild(div);
      actualizarUnTemporizador(div.querySelector('.msg-caduca'));
    }

    cont.scrollTop = cont.scrollHeight;
  }catch(x){}
}

async function enviarDM(){
  var inp = document.getElementById('dm-input');
  var txt = inp.value.trim();
  if(!txt) return;
  inp.value='';

  var claveDm = 'dm-'+[U.nombre.toLowerCase(),DM_ACTUAL.toLowerCase()].sort().join('-');
  var enc = await cifrarConEtiqueta(txt, claveDm);

  try{
    await sb.from('pc_dm').insert({de_usuario:U.nombre, para_usuario:DM_ACTUAL, contenido_cifrado:enc.c, iv:enc.iv});

    if(esCEO(DM_ACTUAL)){
      await sb.from('pc_notificaciones').insert({usuario_destino:DM_ACTUAL, tipo:'sistema', contenido:'Nuevo mensaje de '+U.nombre+' en tu bandeja privada.'});
    }

    await cargarDM();
  }catch(x){}
}

/* ══ ∆Ecosistema° (mini-salas de hasta 12 personas) ══
   Simplificación consciente: el chat interno del ecosistema no tiene límite
   de intervalo entre mensajes (grupo pequeño, 12 personas máximo). */
async function abrirEcosistema(){
  cerrarOverlay('menu-overlay');
  var cont = document.getElementById('eco-content');
  cont.innerHTML='Cargando...';
  document.getElementById('eco-overlay').classList.add('on');

  try{
    var {data:misEco} = await sb.from('pc_ecosistema_miembros').select('ecosistema_id').eq('usuario',U.nombre);
    var idsPropios = (misEco||[]).map(function(m){return m.ecosistema_id;});

    var {data:todos} = await sb.from('pc_ecosistemas').select('id,nombre,ceo_usuario').order('creado_en',{ascending:false}).limit(50);

    var html = '<div class="card-header">∆Ecosistema°</div>';
    html += '<div class="eco-form">' +
      '<input class="inp" id="eco-nombre-nuevo" placeholder="nombre de tu ecosistema (máx 12 personas)">' +
      '<button class="btn" onclick="crearEcosistema()">Crear ecosistema</button>' +
      '</div>';

    (todos||[]).forEach(function(e){
      var soyMiembro = idsPropios.indexOf(e.id) !== -1;
      var soyCeoLocal = eqNombre(e.ceo_usuario, U.nombre);

      html += '<div class="lista-fila">'+escHtml(e.nombre)+' <span style="opacity:.6;">(C.E.O: '+escHtml(e.ceo_usuario)+')</span>' +
        (soyMiembro || soyCeoLocal || U.rol==='centro_mando'
          ? '<span class="accion" onclick="entrarEcosistema('+e.id+',\''+e.nombre.replace(/'/g,"\\'")+'\')">entrar</span>'
          : '<span class="accion" onclick="solicitarEcosistema('+e.id+',\''+e.nombre.replace(/'/g,"\\'")+'\',\''+e.ceo_usuario.replace(/'/g,"\\'")+'\')">solicitar</span>') +
        '</div>';
    });

    cont.innerHTML = html;
  }catch(x){ cont.innerHTML='Error al cargar'; }
}

async function crearEcosistema(){
  var nombre = document.getElementById('eco-nombre-nuevo').value.trim();
  if(!nombre){ return; }

  try{
    var {data,error} = await sb.from('pc_ecosistemas').insert({nombre:nombre, ceo_usuario:U.nombre}).select().single();
    if(error){ alert('Ese nombre de ecosistema ya existe.'); return; }

    await sb.from('pc_ecosistema_miembros').insert({ecosistema_id:data.id, usuario:U.nombre});
    abrirEcosistema();
  }catch(x){ alert('Error al crear el ecosistema'); }
}

async function solicitarEcosistema(ecoId, ecoNombre, ceoLocal){
  try{
    await sb.from('pc_ecosistema_solicitudes').insert({ecosistema_id:ecoId, usuario:U.nombre});
    await sb.from('pc_notificaciones').insert({usuario_destino:ceoLocal, tipo:'solicitud_ecosistema', contenido:U.nombre+' quiere unirse a tu ∆Ecosistema° "'+ecoNombre+'".'});
    alert('Solicitud enviada al C.E.O. del ecosistema.');
  }catch(x){ alert('Ya enviaste una solicitud, o hubo un error.'); }
}

async function responderSolicitudEcosistema(notifId, aceptar){
  // Simplificación: se acepta/rechaza la solicitud pendiente más reciente para
  // este C.E.O., ya que la notificación no guarda el id exacto de la solicitud.
  try{
    var {data:solicitudes} = await sb.from('pc_ecosistema_solicitudes').select('*').eq('estado','pendiente').order('creado_en',{ascending:false}).limit(30);
    var propia = null;

    for(var i=0;i<(solicitudes||[]).length;i++){
      var {data:eco} = await sb.from('pc_ecosistemas').select('ceo_usuario').eq('id',solicitudes[i].ecosistema_id).maybeSingle();
      if(eco && eqNombre(eco.ceo_usuario,U.nombre)){ propia = solicitudes[i]; break; }
    }

    if(!propia){ alert('No se encontró la solicitud (puede que ya haya sido respondida).'); return; }

    await sb.from('pc_ecosistema_solicitudes').update({estado: aceptar?'aceptada':'rechazada'}).eq('id',propia.id);

    if(aceptar){
      var {count} = await sb.from('pc_ecosistema_miembros').select('*',{count:'exact',head:true}).eq('ecosistema_id',propia.ecosistema_id);
      if((count||0)>=12){ alert('Ese ecosistema ya tiene 12 miembros.'); return; }

      await sb.from('pc_ecosistema_miembros').insert({ecosistema_id:propia.ecosistema_id, usuario:propia.usuario});
      await sb.from('pc_notificaciones').insert({usuario_destino:propia.usuario, tipo:'sistema', contenido:'Fuiste aceptado en el ecosistema.'});
    }

    await sb.from('pc_notificaciones').delete().eq('id',notifId);
    abrirNotificaciones();
  }catch(x){}
}

var ECO_ACTUAL = null;
async function entrarEcosistema(ecoId, nombre){
  cerrarOverlay('eco-overlay');
  ECO_ACTUAL = ecoId;
  document.getElementById('dm-header').textContent = '∆Ecosistema° '+nombre;
  document.getElementById('dm-msgs').innerHTML='Cargando...';
  document.getElementById('dm-overlay').classList.add('on');
  document.getElementById('dm-input').setAttribute('onkeydown',"if(event.key==='Enter')enviarMensajeEcosistema()");
  document.querySelector('#dm-input-row button').setAttribute('onclick','enviarMensajeEcosistema()');
  await cargarMensajesEcosistema();
}

async function cargarMensajesEcosistema(){
  try{
    var {data} = await sb.from('pc_ecosistema_mensajes').select('*').eq('ecosistema_id',ECO_ACTUAL).order('creado_en',{ascending:true}).limit(80);
    var cont = document.getElementById('dm-msgs');
    cont.innerHTML='';

    for(var i=0;i<(data||[]).length;i++){
      var m = data[i];
      var texto = await descifrarConEtiqueta(m.contenido_cifrado, m.iv, 'eco-'+ECO_ACTUAL);

      var div = document.createElement('div');
      div.className='msg '+(eqNombre(m.usuario,U.nombre)?'mio':'otro');
      div.innerHTML = (eqNombre(m.usuario,U.nombre)?'':'<div class="msg-header">'+escHtml(m.usuario)+'</div>')+'<div class="msg-burbuja">'+escHtml(texto)+'</div>';
      cont.appendChild(div);
    }

    cont.scrollTop = cont.scrollHeight;
  }catch(x){}
}

async function enviarMensajeEcosistema(){
  var inp = document.getElementById('dm-input');
  var txt = inp.value.trim();
  if(!txt) return;
  inp.value='';

  var enc = await cifrarConEtiqueta(txt, 'eco-'+ECO_ACTUAL);

  try{
    await sb.from('pc_ecosistema_mensajes').insert({ecosistema_id:ECO_ACTUAL, usuario:U.nombre, contenido_cifrado:enc.c, iv:enc.iv});
    await cargarMensajesEcosistema();
  }catch(x){}
}

/* ══ MODERADORES DE APOYO ══ */
async function crearLinkModerador(){
  cerrarOverlay('menu-overlay');
  var nombre = prompt('¿A qué usuario quieres nombrar moderador de apoyo? Escribe su ∆nombre° exacto:');
  if(!nombre) return;

  var token = Math.random().toString(36).slice(2)+Date.now().toString(36);

  try{
    await sb.from('pc_links_moderador').insert({creado_por:U.nombre, para_usuario:nombre, token:token});
    await sb.from('pc_usuarios').update({rol:'moderador'}).ilike('nombre',nombre);
    alert(nombre+' ya es moderador de apoyo (solo puede silenciar 1h, no expulsar ni eliminar).');
  }catch(x){ alert('Error al crear el moderador'); }
}
