'use strict';
/* ── ∆Notificación° (se autoborran a las 48h) ── */
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
  }catch(x){ cont.innerHTML='Error al cargar'; }
  actualizarBadgeNotificaciones();
}

/* ── DM ── */
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
    // ¿puede escribirle libremente al CEO? Solo top 70 de referidos; los demás
    // pueden mandarle igual, pero se marca la notificación como pendiente de revisión.
    await sb.from('pc_dm').insert({de_usuario:U.nombre, para_usuario:DM_ACTUAL, contenido_cifrado:enc.c, iv:enc.iv});
    if(esCEO(DM_ACTUAL)){
      await sb.from('pc_notificaciones').insert({usuario_destino:CEO_NOMBRE, tipo:'sistema', contenido:'Nuevo mensaje de '+U.nombre+' en tu bandeja privada.'}).catch(()=>{});
    }
    await cargarDM();
  }catch(x){}
}

