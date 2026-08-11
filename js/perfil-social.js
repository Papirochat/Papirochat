'use strict';
/* ── MENÚ AL TOCAR NOMBRE/FOTO DE OTRO USUARIO ── */
function abrirMenuUsuario(nombre){
  UM.objetivo = nombre;
  document.getElementById('um-header').textContent = nombre;
  var tools = document.getElementById('um-mod-tools');
  tools.innerHTML='';
  if((U.rol==='moderador'||U.rol==='centro_mando') && !esCEO(nombre)){
    tools.innerHTML =
      '<div class="card-item" onclick="accionMod(\'silenciar_1h\')">🔇 Silenciar 1 hora</div>' +
      (U.rol==='centro_mando' ? (
      '<div class="card-item" onclick="accionMod(\'expulsar_temp_1d\')">⏳ Expulsar 1 día</div>' +
      '<div class="card-item peligro" onclick="accionMod(\'expulsar_perm\')">🚫 Expulsar permanente</div>' +
      '<div class="card-item peligro" onclick="accionMod(\'bloquear\')">⛔ Bloquear cuenta</div>' +
      '<div class="card-item peligro" onclick="accionMod(\'eliminar_cuenta\')">🗑 Eliminar cuenta</div>'
      ) : '');
  }
  document.getElementById('user-menu-overlay').classList.add('on');
}
async function accionMod(accion){
  if(esCEO(UM.objetivo)){ alert('∆luisalfonsocastillejo° tiene inmunidad total. No se puede moderar.'); return; }
  if(!confirm('¿Confirmar acción "'+accion+'" sobre '+UM.objetivo+'?')) return;
  var update = {};
  if(accion==='silenciar_1h'){ update={estado:'silenciado', silenciado_hasta:new Date(Date.now()+3600000).toISOString()}; }
  if(accion==='expulsar_temp_1d'){ update={estado:'expulsado_temp', expulsado_hasta:new Date(Date.now()+86400000).toISOString()}; }
  if(accion==='expulsar_perm'){ update={estado:'expulsado_perm'}; }
  if(accion==='bloquear'){ update={estado:'bloqueado'}; }
  if(accion==='eliminar_cuenta'){ update={estado:'eliminado'}; }
  try{
    await sb.from('pc_usuarios').update(update).ilike('nombre',UM.objetivo);
    await sb.from('pc_moderacion_log').insert({moderador:U.nombre, objetivo:UM.objetivo, accion:accion});
    alert('Acción aplicada.');
  }catch(x){ alert('Error al aplicar la acción'); }
  cerrarOverlay('user-menu-overlay');
}

/* ── PERFIL ── */
async function verPerfil(nombre){
  cerrarOverlay('user-menu-overlay'); cerrarOverlay('menu-overlay');
  var cont = document.getElementById('perfil-content');
  cont.innerHTML='Cargando perfil...';
  document.getElementById('perfil-overlay').classList.add('on');
  try{
    var {data} = await sb.from('pc_usuarios').select('*').ilike('nombre',nombre).maybeSingle();
    if(!data){
      cont.innerHTML = '<div class="profile-caducada">Cuenta caducada por inasistencia.<br><br>Este usuario ya no forma parte de la sociedad de P∆pir°.</div>';
      return;
    }
    var esContactoMio = await esContacto(nombre);
    var esYo = eqNombre(nombre, U.nombre);
    var codigosHtml = (esYo || esContactoMio)
      ? 'Bitchat: '+(data.bitchat_id?escHtml(data.bitchat_id):'—')+'<br>Briar: '+(data.briar_id?escHtml(data.briar_id):'—')
      : '<span class="locked">Bitchat y Briar visibles solo para sus contactos (máx. 70)</span>';

    cont.innerHTML =
      (data.imagen_url ? '<img class="profile-img" src="'+data.imagen_url+'">' : '<div class="profile-img"></div>') +
      '<div class="profile-name">'+escHtml(data.nombre)+(esCEO(nombre)?' <span class="rol-tag rol-ceo">CEO</span>':(data.rol==='moderador'?' <span class="rol-tag rol-mod">MOD</span>':''))+'</div>' +
      '<div class="profile-stat">'+(data.posts_totales||0)+' publicaciones · '+(data.total_referidos||0)+' referidos totales · invitado por '+(data.referido_por?escHtml(data.referido_por):'nadie')+'</div>' +
      '<div class="profile-filo">'+(data.filosofia?escHtml(data.filosofia):'<i>Sin filosofía escrita.</i>')+'</div>' +
      '<div class="profile-codes">'+codigosHtml+'</div>' +
      (!esYo ? '<button class="btn secundario" style="margin-top:10px;" onclick="cerrarOverlay(\'perfil-overlay\');enviarSolicitudAmistad(\''+nombre.replace(/'/g,"\\'")+'\')">➕ Solicitar contacto</button>' : '') +
      (!esYo ? '<button class="btn secundario" style="margin-top:8px;" onclick="cerrarOverlay(\'perfil-overlay\');abrirDM(\''+nombre.replace(/'/g,"\\'")+'\')">✉ Enviar mensaje</button>' : '') +
      (esYo ? '<button class="btn secundario" style="margin-top:8px;" onclick="editarFilosofia(\''+(data.filosofia_editada_en||'')+'\')">✎ Editar mi filosofía</button>' : '') +
      (esYo ? '<button class="btn secundario" style="margin-top:8px;" onclick="cambiarFotoPerfil()">🖼 Cambiar foto de perfil</button>' : '');
  }catch(x){ cont.innerHTML='Error al cargar el perfil'; }
}
function cambiarFotoPerfil(){
  var inputTemp = document.createElement('input');
  inputTemp.type='file'; inputTemp.accept='image/*';
  inputTemp.onchange = async function(){
    var file = inputTemp.files[0];
    if(!file) return;
    try{
      var comprimida = await comprimirImagen(file);
      await sb.from('pc_usuarios').update({imagen_url:comprimida}).ilike('nombre',U.nombre);
      alert('Foto actualizada.'); verPerfil(U.nombre);
    }catch(x){ alert('No se pudo actualizar la foto. Prueba con otra imagen.'); }
  };
  inputTemp.click();
}
async function editarFilosofia(ultimaEdicionISO){
  if(ultimaEdicionISO){
    var horasPasadas = (Date.now() - new Date(ultimaEdicionISO).getTime()) / 3600000;
    if(horasPasadas < 24){ alert('Ya la editaste hace poco. Podrás cambiarla de nuevo en '+Math.ceil(24-horasPasadas)+' horas.'); return; }
  }
  var nueva = prompt('Nueva filosofía (máx 777 caracteres):');
  if(nueva===null) return;
  nueva = nueva.trim().slice(0,777);
  try{
    await sb.from('pc_usuarios').update({ filosofia:nueva||null, filosofia_editada_en:new Date().toISOString() }).ilike('nombre',U.nombre);
    alert('Filosofía actualizada.'); verPerfil(U.nombre);
  }catch(x){ alert('Error al actualizar'); }
}

/* ── CONTACTOS + SOLICITUDES DE AMISTAD ── */
async function esContacto(nombre){
  try{ var {data} = await sb.from('pc_contactos').select('id').eq('dueno',U.nombre).ilike('contacto',nombre).maybeSingle(); return !!data; }
  catch(x){ return false; }
}
async function enviarSolicitudAmistad(nombre){
  cerrarOverlay('user-menu-overlay');
  try{
    await sb.from('pc_solicitudes_amistad').insert({de_usuario:U.nombre, para_usuario:nombre});
    await sb.from('pc_notificaciones').insert({usuario_destino:nombre, tipo:'solicitud_amistad', contenido:U.nombre+' quiere agregarte a sus 70 contactos.'});
    alert('Solicitud enviada.');
  }catch(x){ alert('Ya le enviaste una solicitud, o hubo un error.'); }
}
async function abrirContactos(){
  cerrarOverlay('menu-overlay');
  var cont = document.getElementById('contactos-content');
  cont.innerHTML='Cargando...';
  document.getElementById('contactos-overlay').classList.add('on');

  var {data:contactos} = await sb.from('pc_contactos').select('contacto').eq('dueno',U.nombre);
  var {data:solicitudes} = await sb.from('pc_solicitudes_amistad').select('de_usuario').eq('para_usuario',U.nombre).eq('estado','pendiente');

  var html = '<div class="card-header">∆Contactos° ('+(contactos?contactos.length:0)+'/70)</div>';
  (solicitudes||[]).forEach(function(s){
    html += '<div class="lista-fila">'+escHtml(s.de_usuario)+
      '<span class="accion" onclick="responderSolicitud(\''+s.de_usuario.replace(/'/g,"\\'")+'\',true)">✔ aceptar</span>'+
      '<span class="accion" onclick="responderSolicitud(\''+s.de_usuario.replace(/'/g,"\\'")+'\',false)">✕ rechazar</span></div>';
  });
  (contactos||[]).forEach(function(c){
    html += '<div class="lista-fila">'+escHtml(c.contacto)+
      '<span class="accion" onclick="borrarContacto(\''+c.contacto.replace(/'/g,"\\'")+'\')">quitar</span></div>';
  });
  cont.innerHTML = html || '<div class="card-header">Agenda vacía</div>';
}
async function responderSolicitud(deUsuario, aceptar){
  try{
    await sb.from('pc_solicitudes_amistad').update({estado: aceptar?'aceptada':'rechazada'}).eq('de_usuario',deUsuario).eq('para_usuario',U.nombre);
    if(aceptar){
      var {count} = await sb.from('pc_contactos').select('*',{count:'exact',head:true}).eq('dueno',U.nombre);
      if((count||0)>=70){ alert('Tu agenda está al tope (70/70). Borra a alguien primero.'); abrirContactos(); return; }
      await sb.from('pc_contactos').insert({dueno:U.nombre, contacto:deUsuario});
      await sb.from('pc_notificaciones').insert({usuario_destino:deUsuario, tipo:'sistema', contenido:U.nombre+' aceptó tu solicitud de contacto.'});
    }
    abrirContactos();
  }catch(x){}
}
async function borrarContacto(nombre){
  await sb.from('pc_contactos').delete().eq('dueno',U.nombre).ilike('contacto',nombre);
  abrirContactos();
}

/* ── ∆Record-Referidos° ── */
async function abrirRecordReferidos(){
  cerrarOverlay('menu-overlay');
  var cont = document.getElementById('referidos-content');
  cont.innerHTML='Cargando...';
  document.getElementById('referidos-overlay').classList.add('on');
  try{
    var {data} = await sb.from('pc_usuarios').select('nombre,total_referidos').order('total_referidos',{ascending:false}).limit(70);
    var html = '<div class="card-header">∆Record-Referidos° — TOP 70</div>';
    (data||[]).forEach(function(u,i){
      html += '<div class="lista-fila"><span class="num-grande">'+(i+1)+'</span> '+escHtml(u.nombre)+
        '<span style="margin-left:auto;opacity:.7;">'+(u.total_referidos||0)+' referidos</span></div>';
    });
    cont.innerHTML = html;
  }catch(x){ cont.innerHTML='Error al cargar'; }
}

