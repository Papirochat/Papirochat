'use strict';
/* ── ∆Ecosistema° (mini-salas de hasta 12 personas) ──
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
          : '<span class="accion" onclick="solicitarEcosistema('+e.id+',\''+e.nombre.replace(/'/g,"\\'")+'\',\''+e.ceo_usuario.replace(/'/g,"\\'")+'\')">solicitar entrar</span>') +
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
    // El Centro de Mando también puede ver todas las solicitudes, tiene acceso total.
    alert('Solicitud enviada al C.E.O. del ecosistema.');
  }catch(x){ alert('Ya enviaste una solicitud, o hubo un error.'); }
}
async function responderSolicitudEcosistema(notifId, aceptar){
  // Simplificación: se acepta/rechaza la solicitud pendiente más reciente para
  // este C.E.O., ya que la notificación no guarda el id exacto de la solicitud.
  try{
    var {data:solicitudes} = await sb.from('pc_ecosistema_solicitudes').select('*').eq('estado','pendiente').order('creado_en',{ascending:false}).limit(20);
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

/* ── MODERADORES DE APOYO ── */
async function crearLinkModerador(){
  cerrarOverlay('menu-overlay');
  var nombre = prompt('¿A qué usuario quieres nombrar moderador de apoyo? Escribe su ∆nombre° exacto:');
  if(!nombre) return;
  var token = Math.random().toString(36).slice(2)+Date.now().toString(36);
  try{
    await sb.from('pc_links_moderador').insert({creado_por:U.nombre, para_usuario:nombre, token:token});
    await sb.from('pc_usuarios').update({rol:'moderador'}).ilike('nombre',nombre);
    prompt('Listo. '+nombre+' ya es moderador de apoyo (solo puede silenciar 1h).', '');
  }catch(x){ alert('Error al crear el moderador'); }
}

