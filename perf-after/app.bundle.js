(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict"
exports.createAccountUI=createAccountUI
exports.formatUserID=formatUserID
exports.guest_regex=void 0
var guest_regex=/^anon\d+$/
exports.guest_regex=guest_regex
var assert=require("assert")
var local_storage=require("../glov/client/local_storage.js")
var glov_font=require("../glov/client/font.js")
var _require=require("../glov/client/input.js"),click=_require.click,KEYS=_require.KEYS,keyDownEdge=_require.keyDownEdge
var _require2=require("../glov/client/link.js"),linkGetDefaultStyle=_require2.linkGetDefaultStyle,linkText=_require2.linkText
var random=Math.random,round=Math.round
var net=require("../glov/client/net.js")
var ui=require("../glov/client/ui.js")
var _require3=require("../glov/common/vmath.js"),vec4=_require3.vec4
function formatUserID(user_id,display_name){if(user_id.match(guest_regex)){user_id="guest"}var name=display_name||user_id
if(user_id.toLowerCase()!==name.toLowerCase()){name=display_name+" ("+user_id+")"}return name}function AccountUI(){this.edit_box_name=ui.createEditBox({placeholder:"Username",initial_focus:true,text:local_storage.get("name")||"",autocomplete:"username"})
this.edit_box_password=ui.createEditBox({placeholder:"Password",type:"password",text:local_storage.get("name")&&local_storage.get("password")||""})
this.edit_box_password_confirm=ui.createEditBox({initial_focus:true,placeholder:"Confirm",type:"password",text:"",autocomplete:"new-password"})
this.edit_box_email=ui.createEditBox({placeholder:"Email",text:"",autocomplete:"email"})
this.edit_box_display_name=ui.createEditBox({placeholder:"Display",text:"",autocomplete:"nickname"})
this.creation_mode=false}AccountUI.prototype.logout=function(){this.edit_box_password.setText("")
net.subs.logout()}
AccountUI.prototype.playAsGuest=function(use_name){var name
if(use_name&&(local_storage.get("name")||"").match(guest_regex)){name=local_storage.get("name")}else{name="anon"+String(random()).slice(2,8)}var pass="test"
local_storage.set("name",name)
this.edit_box_name.setText(name)
net.subs.login(name,pass,function(err){if(err){ui.modalDialog({title:"Auto-login Failed",text:err,buttons:{Retry:function Retry(){local_storage.set("did_auto_anon",undefined)
local_storage.set("name",undefined)},Cancel:null}})}else{net.subs.sendCmdParse("rename_random",function(err){if(err){console.log(err)}})}})}
AccountUI.prototype.showLogin=function(param){var _this=this
var x=param.x,y=param.y,style=param.style,button_height=param.button_height,button_width=param.button_width,prelogout=param.prelogout,center=param.center,url_tos=param.url_tos,url_priv=param.url_priv,text_w=param.text_w,font_height=param.font_height,font_height_small=param.font_height_small,label_w=param.label_w,pad=param.pad,status_bar=param.status_bar
font_height=font_height||ui.font_height
font_height_small=font_height_small||font_height*.75
button_height=button_height||ui.button_height
button_width=button_width||240
text_w=text_w||400
label_w=label_w||round(font_height*140/24)
pad=pad||10
var edit_box_name=this.edit_box_name,edit_box_password=this.edit_box_password,edit_box_password_confirm=this.edit_box_password_confirm,edit_box_email=this.edit_box_email,edit_box_display_name=this.edit_box_display_name
var login_message
var BOX_H=font_height
var min_h=BOX_H*2+pad*3+button_height
var calign=center?glov_font.ALIGN.HRIGHT:glov_font.ALIGN.HLEFT|glov_font.ALIGN.HFIT
function showTOS(is_create){if(url_tos){assert(url_priv)
var terms_height=font_height_small
ui.font.drawSizedAligned(style,x,y,Z.UI,terms_height,glov_font.ALIGN.HCENTER,0,0,"By "+(is_create?"creating an account":"logging in")+" you agree to our")
y+=terms_height
var and_w=ui.font.getStringWidth(style,terms_height," and ")
ui.font.drawSizedAligned(style,x,y,Z.UI,terms_height,glov_font.ALIGN.HCENTER,0,0,"and")
linkText({x:x-and_w/2-ui.font.getStringWidth(linkGetDefaultStyle(),terms_height,"Terms of Service"),y:y,z:Z.UI,font_size:terms_height,url:url_tos,text:"Terms of Service"})
linkText({x:x+and_w/2,y:y,z:Z.UI,font_size:terms_height,url:url_priv,text:"Privacy Policy"})
y+=BOX_H+pad}}if(!net.client.connected){login_message="Establishing connection..."}else if(net.subs.logging_in){login_message="Logging in..."}else if(net.subs.logging_out){login_message="Logging out..."}else if(!net.subs.loggedIn()&&window.FBInstant){net.subs.loginFacebook(function(err){if(err){ui.modalDialog({title:"Facebook login Failed",text:err,buttons:{Cancel:null}})}})}else if(!net.subs.loggedIn()&&net.subs.auto_create_user&&!local_storage.get("did_auto_anon")&&!local_storage.get("name")){login_message="Creating guest account..."
local_storage.set("did_auto_anon","yes")
this.playAsGuest(false)}else if(!net.subs.loggedIn()){var submit=false
var w=text_w/2
var indent=center?0:label_w
var text_x=center?x-8:x
ui.font.drawSizedAligned(style,text_x,y,Z.UI,font_height,calign,indent-pad,0,"Username:")
submit=edit_box_name.run({x:x+indent,y:y,w:w,font_height:font_height})===edit_box_name.SUBMIT||submit
y+=BOX_H+pad
ui.font.drawSizedAligned(style,text_x,y,Z.UI,font_height,calign,indent-pad,0,"Password:")
submit=edit_box_password.run({x:x+indent,y:y,w:w,font_height:font_height,autocomplete:this.creation_mode?"new-password":"current-password"})===edit_box_password.SUBMIT||submit
y+=BOX_H+pad
if(this.creation_mode){ui.font.drawSizedAligned(style,text_x,y,Z.UI,font_height,calign,indent-pad,0,"Confirm Password:")
submit=edit_box_password_confirm.run({x:x+indent,y:y,w:w,font_height:font_height})===edit_box_password.SUBMIT||submit
y+=BOX_H+pad
ui.font.drawSizedAligned(style,text_x,y,Z.UI,font_height,calign,indent-pad,0,"Email Address:")
submit=edit_box_email.run({x:x+indent,y:y,w:w,font_height:font_height})===edit_box_password.SUBMIT||submit
y+=BOX_H+pad
ui.font.drawSizedAligned(style,text_x,y,Z.UI,font_height,calign,indent-pad,0,"Display Name:")
submit=edit_box_display_name.run({x:x+indent,y:y,w:w,font_height:font_height})===edit_box_password.SUBMIT||submit
if(ui.buttonText({x:x+w+(center?0:label_w)+pad,y:y,w:button_width*.5,h:BOX_H+pad-2,font_height:font_height_small,text:"Random"})){net.client.send("random_name",null,function(ignored,data){if(data){edit_box_display_name.setText(data)}})}y+=BOX_H+pad
showTOS(true)
submit=ui.buttonText({x:x,y:y,w:button_width,h:button_height,font_height:font_height,text:"Create User"})||submit
if(ui.buttonText({x:x+button_width+pad,y:y,w:button_width,h:button_height,font_height:font_height,text:"Cancel"})||keyDownEdge(KEYS.ESC)){this.creation_mode=false}y+=button_height+pad
if(submit){local_storage.set("name",edit_box_name.text)
net.subs.userCreate({user_id:edit_box_name.text,email:edit_box_email.text,password:edit_box_password.text,password_confirm:edit_box_password_confirm.text,display_name:edit_box_display_name.text},function(err){if(err){ui.modalDialog({title:"Login Error",text:err,buttons:{OK:null}})}else{_this.creation_mode=false
edit_box_password_confirm.setText("")
edit_box_email.setText("")
edit_box_display_name.setText("")}})}}else{showTOS(false)
if(net.subs.auto_create_user){submit=ui.buttonText({x:x,y:y,w:w+label_w,h:button_height,font_height:font_height,text:"Log in / Create user"})||submit
y+=button_height+pad
if(ui.buttonText({x:x,y:y,w:w+label_w,h:button_height,font_height:font_height,text:"Play as Guest"})){this.playAsGuest(true)}}else{submit=ui.buttonText({x:x,y:y,w:button_width,h:button_height,font_height:font_height,text:"Log in"})||submit
if(center){y+=button_height+pad}if(ui.buttonText({x:center?x:x+button_width+pad,y:y,w:button_width,h:button_height,font_height:font_height,text:"New User"})){this.creation_mode=true
edit_box_display_name.setText(edit_box_name.text)
if(edit_box_name.text&&edit_box_password.text){edit_box_password_confirm.initial_focus=true}else{edit_box_password_confirm.initial_focus=false
edit_box_name.focus()}}}y+=button_height+pad
if(submit){local_storage.set("name",edit_box_name.text)
net.subs.login(edit_box_name.text,edit_box_password.text,function(err){if(err){ui.modalDialog({title:"Login Error",text:err,buttons:{OK:null}})}})}}}else{var show_logout=!window.FBInstant
var user_id=net.subs.loggedIn()
var user_channel=net.subs.getChannel("user."+user_id)
var display_name=user_channel.getChannelData("public.display_name")||user_id
var name=formatUserID(user_id,display_name)
if(show_logout){var logged_in_font_height=font_height_small
if(center){ui.font.drawSizedAligned(style,x-text_w/2,y,Z.UI,logged_in_font_height,glov_font.ALIGN.HCENTERFIT,text_w,0,"Logged in as: "+name)
if(click({x:x-text_w/2,y:y,w:text_w,h:logged_in_font_height,button:0})){ui.provideUserString("Your User ID",user_id)}y+=logged_in_font_height+8}else if(status_bar){ui.font.drawSizedAligned(style,x+button_width+8,y,Z.UI,logged_in_font_height,glov_font.ALIGN.HFIT|glov_font.ALIGN.VCENTER,text_w,button_height,"Logged in as: "+name)
if(click({x:x+button_width+8,y:y,w:text_w,h:button_height,button:0})){ui.provideUserString("Your User ID",user_id)}}else{ui.font.drawSizedAligned(style,x+button_width+8,y+logged_in_font_height*-.25,Z.UI,logged_in_font_height,calign|glov_font.ALIGN.VCENTER|glov_font.ALIGN.HFIT,text_w,button_height,"Logged in as:")
ui.font.drawSizedAligned(style,x+button_width+8,y+logged_in_font_height*.75,Z.UI,logged_in_font_height,calign|glov_font.ALIGN.VCENTER|glov_font.ALIGN.HFIT,text_w,button_height,name)
if(click({x:x+button_width+8,y:y,w:text_w,h:logged_in_font_height*2,button:0})){ui.provideUserString("Your User ID",user_id)}}if(ui.buttonText({x:center?x-button_width/2:x,y:y,w:button_width,h:button_height,font_height:font_height,text:"Log out"})){if(prelogout){prelogout()}this.logout()}y+=button_height+8}else{ui.font.drawSizedAligned(style,center?x-text_w/2:x+button_width+8,y,Z.UI,font_height,(center?glov_font.ALIGN.HCENTER:calign)|glov_font.ALIGN.VCENTER|glov_font.ALIGN.HFIT,text_w,button_height,"Logged in as: "+name)}}if(login_message){var _w=ui.font.drawSizedAligned(style,center?x-400:x,y,Z.UI,font_height*1.5,glov_font.ALIGN.HVCENTERFIT,center?800:400,min_h,login_message)
_w+=100
ui.drawRect(x-(center?_w/2:50),y,x+(center?_w/2:_w-50),y+min_h,Z.UI-.5,vec4(0,0,0,.25))
y+=min_h}return y}
function createAccountUI(){return new AccountUI}

},{"../glov/client/font.js":26,"../glov/client/input.js":36,"../glov/client/link.js":37,"../glov/client/local_storage.js":38,"../glov/client/net.js":43,"../glov/client/ui.js":69,"../glov/common/vmath.js":91,"assert":undefined}],2:[function(require,module,exports){
"use strict"
window.glov_build_version="1659041116850"
var called_once=false
window.onload=function(){if(called_once){return}called_once=true
require("../glov/client/bootstrap.js")
if(window.conf_env==="multiplayer"){require("./multiplayer.js").main()}else{require("./main.js").main()}}

},{"../glov/client/bootstrap.js":10,"./main.js":6,"./multiplayer.js":7}],3:[function(require,module,exports){
module.exports={"font_size":8,"imageW":128,"imageH":128,"spread":2,"noFilter":1,"channels":1,"char_infos":[{"c":32,"xpad":4},{"c":33,"x0":92,"y0":2,"yoffs":1,"xpad":1,"w":1,"h":5},{"c":34,"x0":42,"y0":63,"yoffs":1,"xpad":1,"w":3,"h":2},{"c":35,"x0":98,"y0":2,"yoffs":1,"xpad":1,"w":5,"h":5},{"c":36,"x0":38,"y0":2,"yoffs":1,"xpad":1,"w":4,"h":6},{"c":37,"x0":108,"y0":2,"yoffs":1,"xpad":1,"w":5,"h":5},{"c":38,"x0":118,"y0":2,"yoffs":1,"xpad":1,"w":5,"h":5},{"c":39,"x0":50,"y0":63,"yoffs":1,"xpad":1,"w":1,"h":2},{"c":40,"x0":2,"y0":14,"yoffs":1,"xpad":1,"w":2,"h":5},{"c":41,"x0":9,"y0":14,"yoffs":1,"xpad":1,"w":2,"h":5},{"c":42,"x0":2,"y0":63,"yoffs":1,"xpad":1,"w":3,"h":3},{"c":43,"x0":10,"y0":63,"yoffs":2,"xpad":1,"w":3,"h":3},{"c":44,"x0":56,"y0":62,"yoffs":5,"xpad":1,"w":2,"h":2},{"c":45,"x0":87,"y0":62,"yoffs":3,"xpad":1,"w":3,"h":1},{"c":46,"x0":95,"y0":62,"yoffs":5,"xpad":1,"w":1,"h":1},{"c":47,"x0":16,"y0":14,"yoffs":1,"xpad":1,"w":5,"h":5},{"c":48,"x0":26,"y0":14,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":49,"x0":35,"y0":14,"yoffs":1,"xpad":1,"w":2,"h":5},{"c":50,"x0":42,"y0":13,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":51,"x0":51,"y0":13,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":52,"x0":60,"y0":13,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":53,"x0":69,"y0":13,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":54,"x0":78,"y0":13,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":55,"x0":87,"y0":13,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":56,"x0":96,"y0":12,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":57,"x0":105,"y0":12,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":58,"x0":18,"y0":63,"yoffs":2,"xpad":1,"w":1,"h":3},{"c":59,"x0":117,"y0":42,"yoffs":2,"xpad":1,"w":1,"h":4},{"c":60,"x0":114,"y0":12,"yoffs":1,"xpad":1,"w":3,"h":5},{"c":61,"x0":24,"y0":63,"yoffs":2,"xpad":1,"w":3,"h":3},{"c":62,"x0":122,"y0":12,"yoffs":1,"xpad":1,"w":3,"h":5},{"c":63,"x0":2,"y0":24,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":64,"x0":11,"y0":24,"yoffs":1,"xpad":1,"w":5,"h":5},{"c":65,"x0":21,"y0":24,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":66,"x0":30,"y0":24,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":67,"x0":39,"y0":24,"yoffs":1,"xpad":1,"w":3,"h":5},{"c":68,"x0":47,"y0":23,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":69,"x0":56,"y0":23,"yoffs":1,"xpad":1,"w":3,"h":5},{"c":70,"x0":64,"y0":23,"yoffs":1,"xpad":1,"w":3,"h":5},{"c":71,"x0":72,"y0":23,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":72,"x0":81,"y0":23,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":73,"x0":90,"y0":23,"yoffs":1,"xpad":1,"w":3,"h":5},{"c":74,"x0":98,"y0":22,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":75,"x0":107,"y0":22,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":76,"x0":116,"y0":22,"yoffs":1,"xpad":1,"w":3,"h":5},{"c":77,"x0":2,"y0":34,"yoffs":1,"xpad":1,"w":5,"h":5},{"c":78,"x0":12,"y0":34,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":79,"x0":26,"y0":14,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":80,"x0":21,"y0":34,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":81,"x0":47,"y0":2,"yoffs":1,"xpad":1,"w":4,"h":6},{"c":82,"x0":30,"y0":34,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":83,"x0":39,"y0":34,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":84,"x0":48,"y0":33,"yoffs":1,"xpad":1,"w":3,"h":5},{"c":85,"x0":56,"y0":33,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":86,"x0":65,"y0":33,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":87,"x0":74,"y0":33,"yoffs":1,"xpad":1,"w":5,"h":5},{"c":88,"x0":84,"y0":33,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":89,"x0":93,"y0":33,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":90,"x0":102,"y0":32,"yoffs":1,"xpad":1,"w":3,"h":5},{"c":91,"x0":110,"y0":32,"yoffs":1,"xpad":1,"w":2,"h":5},{"c":92,"x0":117,"y0":32,"yoffs":1,"xpad":1,"w":5,"h":5},{"c":93,"x0":2,"y0":44,"yoffs":1,"xpad":1,"w":2,"h":5},{"c":94,"x0":63,"y0":62,"yoffs":1,"xpad":1,"w":3,"h":2},{"c":95,"x0":101,"y0":62,"yoffs":5,"xpad":1,"w":4,"h":1},{"c":96,"x0":71,"y0":62,"yoffs":1,"xpad":1,"w":2,"h":2},{"c":97,"x0":2,"y0":54,"yoffs":2,"xpad":1,"w":4,"h":4},{"c":98,"x0":9,"y0":44,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":99,"x0":11,"y0":54,"yoffs":2,"xpad":1,"w":3,"h":4},{"c":100,"x0":18,"y0":44,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":101,"x0":19,"y0":54,"yoffs":2,"xpad":1,"w":4,"h":4},{"c":102,"x0":27,"y0":44,"yoffs":1,"xpad":1,"w":3,"h":5},{"c":103,"x0":56,"y0":2,"yoffs":2,"xpad":1,"w":4,"h":6},{"c":104,"x0":35,"y0":44,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":105,"x0":44,"y0":44,"yoffs":1,"xpad":1,"w":1,"h":5},{"c":106,"x0":2,"y0":2,"yoffs":1,"xpad":1,"w":2,"h":7},{"c":107,"x0":50,"y0":43,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":108,"x0":59,"y0":43,"yoffs":1,"xpad":1,"w":1,"h":5},{"c":109,"x0":28,"y0":54,"yoffs":2,"xpad":1,"w":5,"h":4},{"c":110,"x0":38,"y0":54,"yoffs":2,"xpad":1,"w":4,"h":4},{"c":111,"x0":47,"y0":54,"yoffs":2,"xpad":1,"w":4,"h":4},{"c":112,"x0":65,"y0":2,"yoffs":2,"xpad":1,"w":4,"h":6},{"c":113,"x0":74,"y0":2,"yoffs":2,"xpad":1,"w":4,"h":6},{"c":114,"x0":56,"y0":53,"yoffs":2,"xpad":1,"w":3,"h":4},{"c":115,"x0":64,"y0":53,"yoffs":2,"xpad":1,"w":4,"h":4},{"c":116,"x0":65,"y0":43,"yoffs":1,"xpad":1,"w":3,"h":5},{"c":117,"x0":73,"y0":53,"yoffs":2,"xpad":1,"w":4,"h":4},{"c":118,"x0":82,"y0":53,"yoffs":2,"xpad":1,"w":4,"h":4},{"c":119,"x0":91,"y0":53,"yoffs":2,"xpad":1,"w":5,"h":4},{"c":120,"x0":101,"y0":53,"yoffs":2,"xpad":1,"w":3,"h":4},{"c":121,"x0":83,"y0":2,"yoffs":2,"xpad":1,"w":4,"h":6},{"c":122,"x0":109,"y0":52,"yoffs":2,"xpad":1,"w":4,"h":4},{"c":123,"x0":73,"y0":43,"yoffs":1,"xpad":1,"w":3,"h":5},{"c":124,"x0":59,"y0":43,"yoffs":1,"xpad":1,"w":1,"h":5},{"c":125,"x0":81,"y0":43,"yoffs":1,"xpad":1,"w":3,"h":5},{"c":126,"x0":78,"y0":62,"yoffs":1,"xpad":1,"w":4,"h":2},{"c":160,"xpad":4},{"c":181,"x0":89,"y0":43,"yoffs":2,"xpad":1,"w":4,"h":5},{"c":916,"x0":118,"y0":51,"yoffs":2,"xpad":1,"w":5,"h":4},{"c":9654,"x0":98,"y0":43,"yoffs":1,"xpad":1,"w":4,"h":5},{"c":9660,"x0":32,"y0":63,"yoffs":2,"xpad":1,"w":5,"h":3},{"c":9742,"x0":9,"y0":2,"yoffs":1,"xpad":1,"w":10,"h":7},{"c":9743,"x0":24,"y0":2,"yoffs":1,"xpad":1,"w":9,"h":7},{"c":65533,"x0":107,"y0":42,"yoffs":2,"xpad":1,"w":5,"h":5}]}
},{}],4:[function(require,module,exports){
module.exports={"font_size":16,"imageW":1024,"imageH":64,"spread":2,"noFilter":1,"channels":1,"char_infos":[{"c":32,"x0":202,"y0":17,"xpad":7,"w":1,"h":1},{"c":33,"x0":137,"y0":2,"yoffs":3,"xpad":2,"w":2,"h":10},{"c":34,"x0":111,"y0":19,"yoffs":3,"xpad":2,"w":6,"h":4},{"c":35,"x0":144,"y0":2,"yoffs":3,"xpad":2,"w":10,"h":10},{"c":36,"x0":59,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":12},{"c":37,"x0":159,"y0":2,"yoffs":3,"xpad":2,"w":10,"h":10},{"c":38,"x0":174,"y0":2,"yoffs":3,"xpad":2,"w":10,"h":10},{"c":39,"x0":122,"y0":19,"yoffs":3,"xpad":2,"w":2,"h":4},{"c":40,"x0":189,"y0":2,"yoffs":3,"xpad":2,"w":4,"h":10},{"c":41,"x0":198,"y0":2,"yoffs":3,"xpad":2,"w":4,"h":10},{"c":42,"x0":56,"y0":21,"yoffs":3,"xpad":2,"w":6,"h":6},{"c":43,"x0":67,"y0":19,"yoffs":5,"xpad":2,"w":6,"h":6},{"c":44,"x0":129,"y0":19,"yoffs":11,"xpad":2,"w":4,"h":4},{"c":45,"x0":171,"y0":17,"yoffs":7,"xpad":2,"w":6,"h":2},{"c":46,"x0":182,"y0":17,"yoffs":11,"xpad":2,"w":2,"h":2},{"c":47,"x0":207,"y0":2,"yoffs":3,"xpad":2,"w":10,"h":10},{"c":48,"x0":222,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":49,"x0":235,"y0":2,"yoffs":3,"xpad":2,"w":4,"h":10},{"c":50,"x0":244,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":51,"x0":257,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":52,"x0":270,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":53,"x0":283,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":54,"x0":296,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":55,"x0":309,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":56,"x0":322,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":57,"x0":335,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":58,"x0":78,"y0":19,"yoffs":5,"xpad":2,"w":2,"h":6},{"c":59,"x0":883,"y0":2,"yoffs":5,"xpad":2,"w":2,"h":8},{"c":60,"x0":348,"y0":2,"yoffs":3,"xpad":2,"w":6,"h":10},{"c":61,"x0":85,"y0":19,"yoffs":5,"xpad":2,"w":6,"h":6},{"c":62,"x0":359,"y0":2,"yoffs":3,"xpad":2,"w":6,"h":10},{"c":63,"x0":370,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":64,"x0":383,"y0":2,"yoffs":3,"xpad":2,"w":10,"h":10},{"c":65,"x0":398,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":66,"x0":411,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":67,"x0":424,"y0":2,"yoffs":3,"xpad":2,"w":6,"h":10},{"c":68,"x0":435,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":69,"x0":448,"y0":2,"yoffs":3,"xpad":2,"w":6,"h":10},{"c":70,"x0":459,"y0":2,"yoffs":3,"xpad":2,"w":6,"h":10},{"c":71,"x0":470,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":72,"x0":483,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":73,"x0":496,"y0":2,"yoffs":3,"xpad":2,"w":6,"h":10},{"c":74,"x0":507,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":75,"x0":520,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":76,"x0":533,"y0":2,"yoffs":3,"xpad":2,"w":6,"h":10},{"c":77,"x0":544,"y0":2,"yoffs":3,"xpad":2,"w":10,"h":10},{"c":78,"x0":559,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":79,"x0":222,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":80,"x0":572,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":81,"x0":72,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":12},{"c":82,"x0":585,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":83,"x0":598,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":84,"x0":611,"y0":2,"yoffs":3,"xpad":2,"w":6,"h":10},{"c":85,"x0":622,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":86,"x0":635,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":87,"x0":648,"y0":2,"yoffs":3,"xpad":2,"w":10,"h":10},{"c":88,"x0":663,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":89,"x0":676,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":90,"x0":689,"y0":2,"yoffs":3,"xpad":2,"w":6,"h":10},{"c":91,"x0":700,"y0":2,"yoffs":3,"xpad":2,"w":4,"h":10},{"c":92,"x0":709,"y0":2,"yoffs":3,"xpad":2,"w":10,"h":10},{"c":93,"x0":724,"y0":2,"yoffs":3,"xpad":2,"w":4,"h":10},{"c":94,"x0":138,"y0":17,"yoffs":3,"xpad":2,"w":6,"h":4},{"c":95,"x0":189,"y0":17,"yoffs":11,"xpad":2,"w":8,"h":2},{"c":96,"x0":149,"y0":17,"yoffs":3,"xpad":2,"w":4,"h":4},{"c":97,"x0":890,"y0":2,"yoffs":5,"xpad":2,"w":8,"h":8},{"c":98,"x0":733,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":99,"x0":903,"y0":2,"yoffs":5,"xpad":2,"w":6,"h":8},{"c":100,"x0":746,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":101,"x0":914,"y0":2,"yoffs":5,"xpad":2,"w":8,"h":8},{"c":102,"x0":759,"y0":2,"yoffs":3,"xpad":2,"w":6,"h":10},{"c":103,"x0":85,"y0":2,"yoffs":5,"xpad":2,"w":8,"h":12},{"c":104,"x0":770,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":105,"x0":783,"y0":2,"yoffs":3,"xpad":2,"w":2,"h":10},{"c":106,"x0":2,"y0":2,"yoffs":3,"xpad":2,"w":4,"h":14},{"c":107,"x0":790,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":108,"x0":803,"y0":2,"yoffs":3,"xpad":2,"w":2,"h":10},{"c":109,"x0":927,"y0":2,"yoffs":5,"xpad":2,"w":10,"h":8},{"c":110,"x0":942,"y0":2,"yoffs":5,"xpad":2,"w":8,"h":8},{"c":111,"x0":955,"y0":2,"yoffs":5,"xpad":2,"w":8,"h":8},{"c":112,"x0":98,"y0":2,"yoffs":5,"xpad":2,"w":8,"h":12},{"c":113,"x0":111,"y0":2,"yoffs":5,"xpad":2,"w":8,"h":12},{"c":114,"x0":968,"y0":2,"yoffs":5,"xpad":2,"w":6,"h":8},{"c":115,"x0":979,"y0":2,"yoffs":5,"xpad":2,"w":8,"h":8},{"c":116,"x0":810,"y0":2,"yoffs":3,"xpad":2,"w":6,"h":10},{"c":117,"x0":992,"y0":2,"yoffs":5,"xpad":2,"w":8,"h":8},{"c":118,"x0":1005,"y0":2,"yoffs":5,"xpad":2,"w":8,"h":8},{"c":119,"x0":2,"y0":21,"yoffs":5,"xpad":2,"w":10,"h":8},{"c":120,"x0":17,"y0":21,"yoffs":5,"xpad":2,"w":6,"h":8},{"c":121,"x0":124,"y0":2,"yoffs":5,"xpad":2,"w":8,"h":12},{"c":122,"x0":28,"y0":21,"yoffs":5,"xpad":2,"w":8,"h":8},{"c":123,"x0":821,"y0":2,"yoffs":3,"xpad":2,"w":6,"h":10},{"c":124,"x0":803,"y0":2,"yoffs":3,"xpad":2,"w":2,"h":10},{"c":125,"x0":832,"y0":2,"yoffs":3,"xpad":2,"w":6,"h":10},{"c":126,"x0":158,"y0":17,"yoffs":3,"xpad":2,"w":8,"h":4},{"c":160,"x0":202,"y0":17,"xpad":7,"w":1,"h":1},{"c":181,"x0":843,"y0":2,"yoffs":5,"xpad":2,"w":8,"h":10},{"c":916,"x0":41,"y0":21,"yoffs":5,"xpad":2,"w":10,"h":8},{"c":9654,"x0":856,"y0":2,"yoffs":3,"xpad":2,"w":8,"h":10},{"c":9660,"x0":96,"y0":19,"yoffs":5,"xpad":2,"w":10,"h":6},{"c":9742,"x0":11,"y0":2,"yoffs":3,"xpad":2,"w":20,"h":14},{"c":9743,"x0":36,"y0":2,"yoffs":3,"xpad":2,"w":18,"h":14},{"c":65533,"x0":869,"y0":2,"yoffs":3,"xpad":1,"w":9,"h":10}]}
},{}],5:[function(require,module,exports){
module.exports={"font_size":32,"imageW":1024,"imageH":512,"spread":8,"channels":1,"char_infos":[{"c":13},{"c":32,"xpad":7.10156},{"c":33,"x0":436,"y0":224,"yoffs":4,"xpad":1.13281,"w":6,"h":22},{"c":34,"x0":914,"y0":334,"yoffs":4,"w":10,"h":8},{"c":35,"x0":704,"y0":301,"yoffs":10,"w":16,"h":17},{"c":36,"x0":215,"y0":8,"yoffs":1,"xpad":1.32031,"w":15,"h":29},{"c":37,"x0":933,"y0":141,"yoffs":4,"xpad":0.773438,"w":26,"h":23},{"c":38,"x0":976,"y0":141,"yoffs":4,"xpad":0.570313,"w":20,"h":23},{"c":39,"x0":941,"y0":334,"yoffs":4,"w":5,"h":8},{"c":40,"x0":8,"y0":190,"yoffs":5,"w":8,"h":23},{"c":41,"x0":33,"y0":190,"yoffs":5,"xpad":0.890625,"w":7,"h":23},{"c":42,"x0":680,"y0":337,"yoffs":2,"w":11,"h":11},{"c":43,"x0":737,"y0":300,"yoffs":9,"xpad":0.414063,"w":15,"h":17},{"c":44,"x0":963,"y0":333,"yoffs":22,"w":5,"h":8},{"c":45,"x0":283,"y0":375,"yoffs":16,"w":9,"h":3},{"c":46,"x0":187,"y0":378,"yoffs":22,"w":5,"h":4},{"c":47,"x0":57,"y0":190,"yoffs":4,"w":13,"h":23},{"c":48,"x0":459,"y0":224,"yoffs":5,"xpad":0.671875,"w":17,"h":22},{"c":49,"x0":442,"y0":263,"yoffs":5,"xpad":5.67188,"w":12,"h":21},{"c":50,"x0":471,"y0":263,"yoffs":5,"xpad":1.67188,"w":16,"h":21},{"c":51,"x0":493,"y0":224,"yoffs":5,"xpad":1.67188,"w":16,"h":22},{"c":52,"x0":504,"y0":263,"yoffs":5,"xpad":0.671875,"w":17,"h":21},{"c":53,"x0":526,"y0":224,"yoffs":5,"xpad":1.67188,"w":16,"h":22},{"c":54,"x0":559,"y0":224,"yoffs":5,"xpad":0.671875,"w":17,"h":22},{"c":55,"x0":538,"y0":263,"yoffs":5,"xpad":1.67188,"w":16,"h":21},{"c":56,"x0":593,"y0":224,"yoffs":5,"xpad":0.671875,"w":17,"h":22},{"c":57,"x0":627,"y0":224,"yoffs":5,"xpad":0.671875,"w":17,"h":22},{"c":58,"x0":436,"y0":341,"yoffs":12,"w":5,"h":14},{"c":59,"x0":682,"y0":301,"yoffs":12,"w":5,"h":18},{"c":60,"x0":867,"y0":99,"yoffs":4,"w":12,"h":25},{"c":61,"x0":882,"y0":334,"yoffs":14,"w":15,"h":9},{"c":62,"x0":896,"y0":99,"yoffs":4,"w":12,"h":25},{"c":63,"x0":661,"y0":224,"yoffs":4,"xpad":0.195313,"w":12,"h":22},{"c":64,"x0":87,"y0":188,"yoffs":7,"xpad":1.21094,"w":23,"h":23},{"c":65,"x0":571,"y0":263,"yoffs":5,"w":19,"h":21},{"c":66,"x0":607,"y0":263,"yoffs":5,"xpad":0.882813,"w":18,"h":21},{"c":67,"x0":690,"y0":223,"yoffs":5,"xpad":0.945313,"w":17,"h":22},{"c":68,"x0":642,"y0":263,"yoffs":5,"xpad":1.01563,"w":20,"h":21},{"c":69,"x0":679,"y0":263,"yoffs":5,"xpad":0.617188,"w":16,"h":21},{"c":70,"x0":712,"y0":262,"yoffs":5,"w":15,"h":21},{"c":71,"x0":724,"y0":223,"yoffs":5,"xpad":1.75,"w":18,"h":22},{"c":72,"x0":744,"y0":262,"yoffs":5,"xpad":2.53906,"w":18,"h":21},{"c":73,"x0":779,"y0":262,"yoffs":5,"xpad":2.54688,"w":6,"h":21},{"c":74,"x0":759,"y0":223,"yoffs":5,"xpad":2.75781,"w":6,"h":22},{"c":75,"x0":802,"y0":262,"yoffs":5,"w":19,"h":21},{"c":76,"x0":838,"y0":262,"yoffs":5,"w":16,"h":21},{"c":77,"x0":871,"y0":262,"yoffs":5,"xpad":2.27344,"w":21,"h":21},{"c":78,"x0":909,"y0":262,"yoffs":5,"xpad":2.74219,"w":19,"h":21},{"c":79,"x0":127,"y0":186,"yoffs":4,"xpad":1.22656,"w":21,"h":23},{"c":80,"x0":945,"y0":261,"yoffs":5,"xpad":0.828125,"w":17,"h":21},{"c":81,"x0":165,"y0":186,"yoffs":4,"xpad":1.22656,"w":21,"h":23},{"c":82,"x0":979,"y0":260,"yoffs":5,"w":19,"h":21},{"c":83,"x0":203,"y0":186,"yoffs":4,"xpad":1.32031,"w":15,"h":23},{"c":84,"x0":8,"y0":309,"yoffs":5,"w":17,"h":21},{"c":85,"x0":782,"y0":223,"yoffs":5,"xpad":2.04688,"w":19,"h":22},{"c":86,"x0":42,"y0":309,"yoffs":5,"w":19,"h":21},{"c":87,"x0":78,"y0":309,"yoffs":5,"w":30,"h":21},{"c":88,"x0":818,"y0":223,"yoffs":5,"w":20,"h":22},{"c":89,"x0":125,"y0":307,"yoffs":5,"w":18,"h":21},{"c":90,"x0":160,"y0":305,"yoffs":5,"xpad":0.226563,"w":17,"h":21},{"c":91,"x0":925,"y0":99,"yoffs":4,"w":9,"h":25},{"c":92,"x0":235,"y0":186,"yoffs":4,"w":13,"h":23},{"c":93,"x0":951,"y0":99,"yoffs":4,"xpad":1.70313,"w":7,"h":25},{"c":94,"x0":985,"y0":333,"yoffs":14,"xpad":0.1875,"w":13,"h":8},{"c":95,"x0":309,"y0":375,"yoffs":23,"xpad":0.4375,"w":12,"h":3},{"c":96,"x0":88,"y0":380,"yoffs":3,"w":6,"h":6},{"c":97,"x0":769,"y0":300,"yoffs":10,"xpad":1.29688,"w":14,"h":17},{"c":98,"x0":265,"y0":184,"yoffs":4,"xpad":0.890625,"w":16,"h":23},{"c":99,"x0":800,"y0":300,"yoffs":10,"xpad":0.273438,"w":14,"h":17},{"c":100,"x0":298,"y0":184,"yoffs":4,"xpad":2.07031,"w":15,"h":23},{"c":101,"x0":831,"y0":300,"yoffs":10,"xpad":1.04688,"w":15,"h":17},{"c":102,"x0":855,"y0":223,"yoffs":4,"w":10,"h":22},{"c":103,"x0":330,"y0":184,"yoffs":10,"xpad":2.07031,"w":15,"h":23},{"c":104,"x0":882,"y0":223,"yoffs":4,"xpad":1.10156,"w":16,"h":22},{"c":105,"x0":194,"y0":305,"yoffs":5,"xpad":1.34375,"w":6,"h":21},{"c":106,"x0":78,"y0":55,"yoffs":5,"xpad":1.07031,"w":7,"h":28},{"c":107,"x0":915,"y0":222,"yoffs":4,"xpad":0.171875,"w":15,"h":22},{"c":108,"x0":947,"y0":222,"yoffs":4,"xpad":1.46875,"w":6,"h":22},{"c":109,"x0":85,"y0":347,"yoffs":10,"xpad":1.14063,"w":25,"h":16},{"c":110,"x0":127,"y0":345,"yoffs":10,"xpad":2.03906,"w":15,"h":16},{"c":111,"x0":863,"y0":300,"yoffs":10,"xpad":0.828125,"w":16,"h":17},{"c":112,"x0":362,"y0":184,"yoffs":10,"xpad":0.890625,"w":16,"h":23},{"c":113,"x0":395,"y0":184,"yoffs":10,"xpad":2.07031,"w":15,"h":23},{"c":114,"x0":219,"y0":343,"yoffs":11,"xpad":0.203125,"w":10,"h":15},{"c":115,"x0":896,"y0":300,"yoffs":10,"xpad":0.28125,"w":13,"h":17},{"c":116,"x0":584,"y0":301,"yoffs":7,"xpad":0.234375,"w":10,"h":20},{"c":117,"x0":159,"y0":345,"yoffs":11,"xpad":1.64844,"w":15,"h":16},{"c":118,"x0":246,"y0":343,"yoffs":11,"w":15,"h":15},{"c":119,"x0":278,"y0":343,"yoffs":11,"w":23,"h":15},{"c":120,"x0":318,"y0":343,"yoffs":11,"w":16,"h":15},{"c":121,"x0":970,"y0":221,"yoffs":11,"w":15,"h":22},{"c":122,"x0":351,"y0":341,"yoffs":11,"xpad":0.851563,"w":13,"h":15},{"c":123,"x0":1002,"y0":221,"yoffs":6,"w":9,"h":22},{"c":124,"x0":8,"y0":8,"w":7,"h":32},{"c":125,"x0":8,"y0":270,"yoffs":6,"xpad":0.460938,"w":8,"h":22},{"c":126,"x0":158,"y0":378,"yoffs":16,"xpad":0.3125,"w":12,"h":5},{"c":144,"x0":8,"y0":381,"yoffs":-5,"w":14,"h":8},{"c":160,"xpad":7.10156},{"c":161,"x0":33,"y0":270,"yoffs":4,"xpad":1.13281,"w":6,"h":22},{"c":162,"x0":427,"y0":184,"yoffs":7,"xpad":0.273438,"w":14,"h":23},{"c":163,"x0":217,"y0":305,"yoffs":5,"xpad":0.304688,"w":14,"h":21},{"c":164,"x0":611,"y0":301,"yoffs":9,"xpad":0.328125,"w":20,"h":20},{"c":165,"x0":248,"y0":305,"yoffs":5,"w":18,"h":21},{"c":166,"x0":458,"y0":184,"yoffs":4,"xpad":2.10156,"w":6,"h":23},{"c":167,"x0":102,"y0":55,"yoffs":2,"xpad":1.25,"w":17,"h":28},{"c":168,"x0":209,"y0":376,"yoffs":4,"xpad":0.453125,"w":9,"h":4},{"c":169,"x0":481,"y0":184,"yoffs":4,"xpad":0.625,"w":25,"h":23},{"c":170,"x0":586,"y0":338,"yoffs":4,"xpad":0.296875,"w":10,"h":12},{"c":171,"x0":708,"y0":335,"yoffs":13,"xpad":0.140625,"w":11,"h":11},{"c":172,"x0":764,"y0":334,"yoffs":13,"xpad":0.382813,"w":15,"h":10},{"c":173,"xpad":3.94531},{"c":174,"x0":283,"y0":305,"yoffs":1,"xpad":0.3125,"w":22,"h":21},{"c":175,"x0":235,"y0":375,"yoffs":4,"w":9,"h":4},{"c":176,"x0":63,"y0":381,"yoffs":4,"w":8,"h":7},{"c":177,"x0":926,"y0":300,"yoffs":9,"w":14,"h":17},{"c":178,"x0":458,"y0":339,"yoffs":2,"xpad":0.890625,"w":11,"h":14},{"c":179,"x0":191,"y0":343,"yoffs":2,"xpad":1.52344,"w":11,"h":16},{"c":180,"x0":111,"y0":380,"yoffs":3,"w":6,"h":6},{"c":181,"x0":56,"y0":270,"yoffs":11,"xpad":1.85938,"w":15,"h":22},{"c":182,"x0":322,"y0":303,"yoffs":5,"xpad":0.5,"w":26,"h":21},{"c":183,"x0":261,"y0":375,"yoffs":16,"w":5,"h":4},{"c":184,"x0":39,"y0":381,"yoffs":25,"xpad":0.0703125,"w":7,"h":8},{"c":185,"x0":486,"y0":339,"yoffs":2,"xpad":0.6875,"w":10,"h":14},{"c":186,"x0":613,"y0":338,"yoffs":4,"xpad":0.625,"w":11,"h":12},{"c":187,"x0":736,"y0":335,"yoffs":13,"xpad":0.140625,"w":11,"h":11},{"c":188,"x0":247,"y0":8,"yoffs":2,"xpad":0.0546875,"w":25,"h":29},{"c":189,"x0":136,"y0":55,"yoffs":2,"xpad":1.22656,"w":25,"h":28},{"c":190,"x0":289,"y0":8,"yoffs":2,"xpad":0.109375,"w":26,"h":29},{"c":191,"x0":88,"y0":270,"yoffs":6,"xpad":0.09375,"w":13,"h":22},{"c":192,"x0":178,"y0":55,"yoffs":-2,"w":19,"h":28},{"c":193,"x0":214,"y0":55,"yoffs":-2,"w":19,"h":28},{"c":194,"x0":250,"y0":54,"yoffs":-2,"w":19,"h":28},{"c":195,"x0":648,"y0":99,"w":19,"h":26},{"c":196,"x0":252,"y0":99,"yoffs":-1,"w":19,"h":27},{"c":197,"x0":286,"y0":54,"yoffs":-2,"w":19,"h":28},{"c":198,"x0":365,"y0":303,"yoffs":5,"xpad":0.28125,"w":27,"h":21},{"c":199,"x0":322,"y0":54,"yoffs":5,"xpad":0.945313,"w":17,"h":28},{"c":200,"x0":356,"y0":54,"yoffs":-2,"xpad":0.617188,"w":16,"h":28},{"c":201,"x0":389,"y0":54,"yoffs":-2,"xpad":0.617188,"w":16,"h":28},{"c":202,"x0":422,"y0":54,"yoffs":-2,"xpad":0.617188,"w":16,"h":28},{"c":203,"x0":288,"y0":99,"yoffs":-1,"xpad":0.617188,"w":16,"h":27},{"c":204,"x0":455,"y0":54,"yoffs":-2,"xpad":1.54688,"w":7,"h":28},{"c":205,"x0":479,"y0":54,"yoffs":-2,"xpad":0.546875,"w":8,"h":28},{"c":206,"x0":504,"y0":54,"yoffs":-2,"w":11,"h":28},{"c":207,"x0":321,"y0":99,"yoffs":-1,"w":9,"h":27},{"c":208,"x0":409,"y0":303,"yoffs":5,"xpad":1.22656,"w":20,"h":21},{"c":209,"x0":684,"y0":99,"xpad":2.74219,"w":19,"h":26},{"c":210,"x0":332,"y0":8,"yoffs":-2,"xpad":1.22656,"w":21,"h":29},{"c":211,"x0":370,"y0":8,"yoffs":-2,"xpad":1.22656,"w":21,"h":29},{"c":212,"x0":408,"y0":8,"yoffs":-2,"xpad":1.22656,"w":21,"h":29},{"c":213,"x0":347,"y0":99,"xpad":1.22656,"w":21,"h":27},{"c":214,"x0":532,"y0":54,"yoffs":-1,"xpad":1.22656,"w":21,"h":28},{"c":215,"x0":381,"y0":341,"yoffs":11,"xpad":0.359375,"w":15,"h":15},{"c":216,"x0":523,"y0":184,"yoffs":4,"xpad":1.22656,"w":21,"h":23},{"c":217,"x0":446,"y0":8,"yoffs":-2,"xpad":2.04688,"w":19,"h":29},{"c":218,"x0":482,"y0":8,"yoffs":-2,"xpad":2.04688,"w":19,"h":29},{"c":219,"x0":518,"y0":8,"yoffs":-2,"xpad":2.04688,"w":19,"h":29},{"c":220,"x0":570,"y0":54,"yoffs":-1,"xpad":2.04688,"w":19,"h":28},{"c":221,"x0":606,"y0":54,"yoffs":-2,"w":18,"h":28},{"c":222,"x0":446,"y0":301,"yoffs":5,"xpad":1.00781,"w":17,"h":21},{"c":223,"x0":480,"y0":301,"yoffs":5,"xpad":1.30469,"w":17,"h":21},{"c":224,"x0":69,"y0":147,"yoffs":3,"xpad":1.29688,"w":14,"h":24},{"c":225,"x0":100,"y0":145,"yoffs":3,"xpad":1.29688,"w":14,"h":24},{"c":226,"x0":131,"y0":145,"yoffs":3,"xpad":1.29688,"w":14,"h":24},{"c":227,"x0":561,"y0":184,"yoffs":4,"xpad":1.29688,"w":14,"h":23},{"c":228,"x0":592,"y0":184,"yoffs":4,"xpad":1.29688,"w":14,"h":23},{"c":229,"x0":975,"y0":99,"yoffs":2,"xpad":1.29688,"w":14,"h":25},{"c":230,"x0":957,"y0":299,"yoffs":10,"xpad":0.960938,"w":24,"h":17},{"c":231,"x0":623,"y0":184,"yoffs":10,"xpad":0.273438,"w":14,"h":23},{"c":232,"x0":162,"y0":145,"yoffs":3,"xpad":1.04688,"w":15,"h":24},{"c":233,"x0":194,"y0":145,"yoffs":3,"xpad":1.04688,"w":15,"h":24},{"c":234,"x0":226,"y0":145,"yoffs":3,"xpad":1.04688,"w":15,"h":24},{"c":235,"x0":654,"y0":184,"yoffs":4,"xpad":1.04688,"w":15,"h":23},{"c":236,"x0":686,"y0":183,"yoffs":3,"xpad":1.34375,"w":6,"h":23},{"c":237,"x0":709,"y0":183,"yoffs":3,"w":8,"h":23},{"c":238,"x0":734,"y0":183,"yoffs":3,"w":11,"h":23},{"c":239,"x0":118,"y0":268,"yoffs":4,"w":9,"h":22},{"c":240,"x0":762,"y0":183,"yoffs":4,"xpad":1.53125,"w":15,"h":23},{"c":241,"x0":144,"y0":266,"yoffs":4,"xpad":2.03906,"w":15,"h":22},{"c":242,"x0":258,"y0":143,"yoffs":3,"xpad":0.828125,"w":16,"h":24},{"c":243,"x0":291,"y0":143,"yoffs":3,"xpad":0.828125,"w":16,"h":24},{"c":244,"x0":324,"y0":143,"yoffs":3,"xpad":0.828125,"w":16,"h":24},{"c":245,"x0":794,"y0":183,"yoffs":4,"xpad":0.828125,"w":16,"h":23},{"c":246,"x0":827,"y0":183,"yoffs":4,"xpad":0.828125,"w":16,"h":23},{"c":247,"x0":513,"y0":339,"yoffs":11,"xpad":0.453125,"w":14,"h":14},{"c":248,"x0":998,"y0":298,"yoffs":10,"xpad":0.828125,"w":16,"h":17},{"c":249,"x0":357,"y0":143,"yoffs":3,"xpad":1.64844,"w":15,"h":24},{"c":250,"x0":389,"y0":143,"yoffs":3,"xpad":1.64844,"w":15,"h":24},{"c":251,"x0":421,"y0":143,"yoffs":3,"xpad":1.64844,"w":15,"h":24},{"c":252,"x0":860,"y0":183,"yoffs":4,"xpad":1.64844,"w":15,"h":23},{"c":253,"x0":64,"y0":8,"yoffs":3,"w":15,"h":30},{"c":254,"x0":554,"y0":8,"yoffs":4,"xpad":0.890625,"w":16,"h":29},{"c":255,"x0":587,"y0":8,"yoffs":4,"w":15,"h":29},{"c":256,"x0":720,"y0":99,"w":19,"h":26},{"c":257,"x0":892,"y0":182,"yoffs":4,"xpad":1.29688,"w":14,"h":23},{"c":258,"x0":385,"y0":99,"yoffs":-1,"w":19,"h":27},{"c":259,"x0":453,"y0":143,"yoffs":3,"xpad":1.29688,"w":14,"h":24},{"c":260,"x0":641,"y0":54,"yoffs":5,"w":21,"h":28},{"c":261,"x0":923,"y0":182,"yoffs":10,"w":16,"h":23},{"c":262,"x0":619,"y0":8,"yoffs":-2,"xpad":0.945313,"w":17,"h":29},{"c":263,"x0":484,"y0":143,"yoffs":3,"xpad":0.273438,"w":14,"h":24},{"c":268,"x0":653,"y0":8,"yoffs":-2,"xpad":0.945313,"w":17,"h":29},{"c":269,"x0":515,"y0":143,"yoffs":3,"xpad":0.273438,"w":14,"h":24},{"c":270,"x0":679,"y0":54,"yoffs":-2,"xpad":1.01563,"w":20,"h":28},{"c":271,"x0":956,"y0":181,"yoffs":4,"w":22,"h":23},{"c":272,"x0":409,"y0":303,"yoffs":5,"xpad":1.22656,"w":20,"h":21},{"c":273,"x0":995,"y0":181,"yoffs":4,"xpad":0.0703125,"w":17,"h":23},{"c":274,"x0":756,"y0":99,"xpad":0.617188,"w":16,"h":26},{"c":275,"x0":8,"y0":230,"yoffs":4,"xpad":1.04688,"w":15,"h":23},{"c":278,"x0":421,"y0":99,"yoffs":-1,"xpad":0.617188,"w":16,"h":27},{"c":279,"x0":40,"y0":230,"yoffs":4,"xpad":1.04688,"w":15,"h":23},{"c":280,"x0":716,"y0":54,"yoffs":5,"xpad":0.617188,"w":16,"h":28},{"c":281,"x0":72,"y0":230,"yoffs":10,"xpad":1.04688,"w":15,"h":23},{"c":282,"x0":749,"y0":54,"yoffs":-2,"xpad":0.617188,"w":16,"h":28},{"c":283,"x0":546,"y0":143,"yoffs":3,"xpad":1.04688,"w":15,"h":24},{"c":286,"x0":782,"y0":54,"yoffs":-1,"xpad":1.75,"w":18,"h":28},{"c":287,"x0":96,"y0":8,"yoffs":3,"xpad":2.07031,"w":15,"h":30},{"c":290,"x0":817,"y0":54,"yoffs":5,"xpad":1.75,"w":18,"h":28},{"c":291,"x0":32,"y0":8,"yoffs":2,"xpad":2.07031,"w":15,"h":31},{"c":298,"x0":789,"y0":99,"w":9,"h":26},{"c":299,"x0":176,"y0":266,"yoffs":4,"w":9,"h":22},{"c":302,"x0":852,"y0":54,"yoffs":5,"xpad":0.546875,"w":8,"h":28},{"c":303,"x0":877,"y0":54,"yoffs":5,"w":8,"h":28},{"c":304,"x0":454,"y0":99,"yoffs":-1,"xpad":1.54688,"w":7,"h":27},{"c":305,"x0":413,"y0":341,"yoffs":11,"xpad":1.34375,"w":6,"h":15},{"c":310,"x0":687,"y0":8,"yoffs":5,"w":19,"h":29},{"c":311,"x0":128,"y0":8,"yoffs":4,"xpad":0.171875,"w":15,"h":30},{"c":313,"x0":902,"y0":54,"yoffs":-2,"w":16,"h":28},{"c":314,"x0":815,"y0":99,"w":8,"h":26},{"c":315,"x0":723,"y0":8,"yoffs":5,"w":16,"h":29},{"c":316,"x0":160,"y0":8,"yoffs":4,"xpad":1.46875,"w":6,"h":30},{"c":317,"x0":202,"y0":266,"yoffs":4,"w":16,"h":22},{"c":318,"x0":235,"y0":266,"yoffs":4,"w":12,"h":22},{"c":321,"x0":514,"y0":301,"yoffs":5,"xpad":0.046875,"w":16,"h":21},{"c":322,"x0":264,"y0":266,"yoffs":4,"w":11,"h":22},{"c":323,"x0":935,"y0":54,"yoffs":-2,"xpad":2.74219,"w":19,"h":28},{"c":324,"x0":104,"y0":228,"yoffs":3,"xpad":2.03906,"w":15,"h":23},{"c":325,"x0":756,"y0":8,"yoffs":5,"xpad":2.74219,"w":19,"h":29},{"c":326,"x0":578,"y0":143,"yoffs":10,"xpad":2.03906,"w":15,"h":24},{"c":327,"x0":971,"y0":54,"yoffs":-2,"xpad":2.74219,"w":19,"h":28},{"c":328,"x0":136,"y0":226,"yoffs":3,"xpad":2.03906,"w":15,"h":23},{"c":332,"x0":478,"y0":99,"xpad":1.22656,"w":21,"h":27},{"c":333,"x0":168,"y0":226,"yoffs":4,"xpad":0.828125,"w":16,"h":23},{"c":336,"x0":792,"y0":8,"yoffs":-2,"xpad":1.22656,"w":21,"h":29},{"c":337,"x0":610,"y0":143,"yoffs":3,"xpad":0.828125,"w":16,"h":24},{"c":338,"x0":292,"y0":264,"yoffs":5,"xpad":0.390625,"w":29,"h":22},{"c":339,"x0":8,"y0":347,"yoffs":10,"xpad":0.65625,"w":25,"h":17},{"c":340,"x0":8,"y0":103,"yoffs":-2,"w":19,"h":28},{"c":341,"x0":201,"y0":226,"yoffs":3,"xpad":0.203125,"w":10,"h":23},{"c":342,"x0":830,"y0":8,"yoffs":5,"w":19,"h":29},{"c":343,"x0":228,"y0":226,"yoffs":11,"xpad":0.203125,"w":10,"h":23},{"c":344,"x0":44,"y0":102,"yoffs":-2,"w":19,"h":28},{"c":345,"x0":255,"y0":226,"yoffs":3,"xpad":0.203125,"w":10,"h":23},{"c":346,"x0":866,"y0":8,"yoffs":-2,"xpad":1.32031,"w":15,"h":29},{"c":347,"x0":643,"y0":143,"yoffs":3,"xpad":0.28125,"w":13,"h":24},{"c":350,"x0":898,"y0":8,"yoffs":4,"xpad":1.32031,"w":15,"h":29},{"c":351,"x0":282,"y0":224,"yoffs":10,"xpad":0.28125,"w":13,"h":23},{"c":352,"x0":930,"y0":8,"yoffs":-2,"xpad":1.32031,"w":15,"h":29},{"c":353,"x0":673,"y0":142,"yoffs":3,"xpad":0.28125,"w":13,"h":24},{"c":354,"x0":80,"y0":100,"yoffs":5,"w":17,"h":28},{"c":355,"x0":840,"y0":99,"yoffs":7,"xpad":0.234375,"w":10,"h":26},{"c":356,"x0":114,"y0":100,"yoffs":-2,"w":17,"h":28},{"c":357,"x0":312,"y0":224,"yoffs":4,"w":15,"h":23},{"c":362,"x0":516,"y0":99,"xpad":2.04688,"w":19,"h":27},{"c":363,"x0":344,"y0":224,"yoffs":4,"xpad":1.64844,"w":15,"h":23},{"c":366,"x0":962,"y0":8,"yoffs":-2,"xpad":2.04688,"w":19,"h":29},{"c":367,"x0":8,"y0":148,"yoffs":2,"xpad":1.64844,"w":15,"h":25},{"c":368,"x0":8,"y0":57,"yoffs":-2,"xpad":2.04688,"w":19,"h":29},{"c":369,"x0":703,"y0":142,"yoffs":3,"xpad":1.64844,"w":15,"h":24},{"c":370,"x0":148,"y0":100,"yoffs":5,"xpad":2.04688,"w":19,"h":28},{"c":371,"x0":338,"y0":264,"yoffs":11,"w":17,"h":22},{"c":376,"x0":552,"y0":99,"yoffs":-1,"w":18,"h":27},{"c":377,"x0":184,"y0":100,"yoffs":-2,"xpad":0.226563,"w":17,"h":28},{"c":378,"x0":376,"y0":224,"yoffs":3,"xpad":0.851563,"w":13,"h":23},{"c":379,"x0":587,"y0":99,"yoffs":-1,"xpad":0.226563,"w":17,"h":27},{"c":380,"x0":372,"y0":264,"yoffs":4,"xpad":0.851563,"w":13,"h":22},{"c":381,"x0":218,"y0":100,"yoffs":-2,"xpad":0.226563,"w":17,"h":28},{"c":382,"x0":406,"y0":224,"yoffs":3,"xpad":0.851563,"w":13,"h":23},{"c":402,"x0":40,"y0":148,"yoffs":4,"w":12,"h":25},{"c":536,"x0":183,"y0":8,"yoffs":4,"xpad":1.32031,"w":15,"h":30},{"c":537,"x0":735,"y0":142,"yoffs":10,"xpad":0.28125,"w":13,"h":24},{"c":538,"x0":44,"y0":56,"yoffs":5,"w":17,"h":29},{"c":539,"x0":621,"y0":99,"yoffs":7,"xpad":0.234375,"w":10,"h":27},{"c":916,"x0":402,"y0":264,"yoffs":4,"xpad":3.88281,"w":23,"h":22},{"c":8226,"x0":134,"y0":378,"yoffs":13,"xpad":0.28125,"w":7,"h":6},{"c":8482,"x0":641,"y0":338,"yoffs":5,"xpad":0.882813,"w":22,"h":12},{"c":8592,"x0":796,"y0":334,"yoffs":11,"xpad":0.882813,"w":26,"h":10},{"c":8593,"x0":765,"y0":142,"yoffs":4,"xpad":7.88281,"w":19,"h":24},{"c":8594,"x0":839,"y0":334,"yoffs":11,"xpad":0.882813,"w":26,"h":10},{"c":8595,"x0":801,"y0":142,"yoffs":4,"xpad":7.88281,"w":19,"h":24},{"c":8734,"x0":544,"y0":339,"yoffs":11,"xpad":0.6875,"w":25,"h":14},{"c":9654,"x0":648,"y0":301,"yoffs":6,"w":17,"h":19},{"c":9660,"x0":50,"y0":347,"yoffs":7,"w":18,"h":17},{"c":9742,"x0":837,"y0":142,"yoffs":4,"w":31,"h":24},{"c":9743,"x0":885,"y0":141,"yoffs":4,"w":31,"h":24},{"c":65533,"x0":547,"y0":301,"yoffs":5,"w":20,"h":21}]}
},{}],6:[function(require,module,exports){
"use strict"
exports.game_width=exports.game_height=void 0
exports.main=main
exports.sprites=void 0
var local_storage=require("../glov/client/local_storage.js")
local_storage.setStoragePrefix("glovjs-perf")
var _glovClientEngineJs=require("../glov/client/engine.js")
var engine=_glovClientEngineJs
var _glovClientFontJs=require("../glov/client/font.js")
var glov_font=_glovClientFontJs
var _glovClientInputJs=require("../glov/client/input.js")
var input=_glovClientInputJs
var floor=Math.floor,sin=Math.sin
var _glovClientNetJs=require("../glov/client/net.js")
var net=_glovClientNetJs
var _glovClientParticlesJs=require("../glov/client/particles.js")
var particles=_glovClientParticlesJs
var _glovClientSettingsJs=require("../glov/client/settings.js")
var settings=_glovClientSettingsJs
var _glovClientSliderJs=require("../glov/client/slider.js")
var slider=_glovClientSliderJs.slider
var _glovClientSoundJs=require("../glov/client/sound.js")
var FADE_IN=_glovClientSoundJs.FADE_IN
var FADE_OUT=_glovClientSoundJs.FADE_OUT
var soundLoad=_glovClientSoundJs.soundLoad
var soundPlay=_glovClientSoundJs.soundPlay
var soundPlayMusic=_glovClientSoundJs.soundPlayMusic
var _glovClientSpineJs=require("../glov/client/spine.js")
var spineCreate=_glovClientSpineJs.spineCreate
var _glovClientSprite_animationJs=require("../glov/client/sprite_animation.js")
var createSpriteAnimation=_glovClientSprite_animationJs.createSpriteAnimation
var _glovClientSpritesJs=require("../glov/client/sprites.js")
var glov_sprites=_glovClientSpritesJs
var _glovClientSpritesJs2=require("../glov/client/sprites.js")
var createSprite=_glovClientSpritesJs2.createSprite
var _glovClientTransitionJs=require("../glov/client/transition.js")
var transition=_glovClientTransitionJs
var _glovClientUiJs=require("../glov/client/ui.js")
var ui=_glovClientUiJs
var _glovClientUiJs2=require("../glov/client/ui.js")
var uiHandlingNav=_glovClientUiJs2.uiHandlingNav
var _glovClientUi_testJs=require("../glov/client/ui_test.js")
var ui_test=_glovClientUi_testJs
var _glovCommonVmathJs=require("../glov/common/vmath.js")
var v4clone=_glovCommonVmathJs.v4clone
var v4copy=_glovCommonVmathJs.v4copy
var vec2=_glovCommonVmathJs.vec2
var vec4=_glovCommonVmathJs.vec4
var _particle_dataJs=require("./particle_data.js")
var particle_data=_particle_dataJs
var _test_3dJs=require("./test_3d.js")
var test3D=_test_3dJs.test3D
window.Z=window.Z||{}
Z.BACKGROUND=1
Z.SPRITES=10
Z.PARTICLES=20
Z.UI_TEST=200
var game_width=320
exports.game_width=game_width
var game_height=240
exports.game_height=game_height
var sprites={}
exports.sprites=sprites
var music_file="music_test.webm"
var flags={}
function flagGet(key,dflt){if(flags[key]===undefined){flags[key]=local_storage.getJSON("flag_"+key,dflt)||false}return flags[key]}function flagToggle(key){flags[key]=!flagGet(key)
local_storage.setJSON("flag_"+key,flags[key])}function flagSet(key,value){flags[key]=value
local_storage.setJSON("flag_"+key,flags[key])}var color_white=vec4(1,1,1,1)
var colors_active=ui.makeColorSet(vec4(.5,1,.5,1))
var colors_inactive=ui.makeColorSet(vec4(.5,.5,.5,1))
function perfTestSprites(){if(!sprites.test){sprites.test=[createSprite({name:"test",size:vec2(1,1),origin:vec2(.5,.5)}),createSprite({url:"img/test.png?1",size:vec2(1,1),origin:vec2(.5,.5)})]}var mode=4
var count=[8e4,4e4,2e4,6e4,6e4][mode]
if(mode===3||mode===4){var z=0
for(var ii=0;ii<count;){var subc=floor(500+Math.random()*100)
var idx=mode<=1?0:Math.round(Math.random())
var sprite=sprites.test[idx]
for(var jj=0;jj<subc;++jj){if(mode===4){glov_sprites.queuesprite(sprite,Math.random()*game_width,Math.random()*game_height,z,6*sprite.size[0],6*sprite.size[1],0,sprite.uvs,color_white)}else{sprites.test[idx].draw({x:Math.random()*game_width,y:Math.random()*game_height,z:z,w:6,h:6})}z+=.01}ii+=subc}}else{for(var _ii=0;_ii<count;++_ii){var _idx=mode<=1?0:Math.round(Math.random())
sprites.test[_idx].draw({x:Math.random()*game_width,y:Math.random()*game_height,z:mode===0?_ii:Math.random(),w:6,h:6})}}}var color_black=vec4(0,0,0,1)
var line_precise=1
function lineTest(){var line_len=20
var y_values=[20,25.25,30.5,35.667,45+sin(engine.frame_timestamp*.001)*5]
var widths=[.5,1,1.5,2,4]
var z=Z.UI
line_precise=slider(line_precise,{x:2,y:2,min:0,max:1})
for(var widx=0;widx<widths.length;++widx){var width=widths[widx]
var x0=10+widx*(line_len+4)
for(var jj=0;jj<y_values.length;++jj){var x=x0+jj*2
var y=y_values[jj]
ui.drawLine(x,y,x+line_len,y,z,width,line_precise,color_black,ui.LINE_ALIGN|ui.LINE_CAP_SQUARE)
z+=.1
ui.drawLine(x,y,x+line_len,y+4.5,z,width,line_precise,color_black,ui.LINE_ALIGN|ui.LINE_CAP_ROUND)
z+=.1
ui.drawLine(x,y,x,y+line_len/2,z,width,line_precise,color_black,ui.LINE_ALIGN|ui.LINE_CAP_SQUARE)
z+=.1}}ui.drawLine(50,72,250,200,z,20,line_precise,color_black,ui.LINE_CAP_ROUND)}function main(){if(engine.DEBUG){net.init({engine:engine})}var font_info_04b03x2=require("./img/font/04b03_8x2.json")
var font_info_04b03x1=require("./img/font/04b03_8x1.json")
var font_info_palanquin32=require("./img/font/palanquin32.json")
var pixely=flagGet("pixely","off")
var font
if(pixely==="strict"){font={info:font_info_04b03x1,texture:"font/04b03_8x1"}}else if(pixely&&pixely!=="off"){font={info:font_info_04b03x2,texture:"font/04b03_8x2"}}else{font={info:font_info_palanquin32,texture:"font/palanquin32"}}if(!engine.startup({game_width:game_width,game_height:game_height,pixely:pixely,font:font,viewport_postprocess:false})){return}font=engine.font
ui.scaleSizes(13/32)
ui.setFontHeight(8)
settings.set("show_profiler",1)
settings.set("max_fps",0)
settings.set("show_fps",4)
settings.set("fps_window",10)
var color_red=vec4(1,0,0,1)
var color_yellow=vec4(1,1,0,1)
var KEYS=input.KEYS
var PAD=input.PAD
var sprite_size=64
function initGraphics(){particles.preloadParticleData(particle_data)
soundLoad("test")
sprites.white=createSprite({url:"white"})
sprites.test_tint=createSprite({name:"tinted",ws:[16,16,16,16],hs:[16,16,16],size:vec2(sprite_size,sprite_size),layers:2,origin:vec2(.5,.5)})
sprites.animation=createSpriteAnimation({idle_left:{frames:[0,1],times:[200,500]},idle_right:{frames:[3,2],times:[200,500]}})
sprites.animation.setState("idle_left")
sprites.game_bg=createSprite({url:"white",size:vec2(game_width,game_height)})}var spine_inited=false
var spine_anim
function spineInit(){spine_inited=true
spine_anim=spineCreate({skel:"spine/dino.skel",atlas:"spine/dino.atlas",mix:{idle:{run:.25},idle_left:{run_left:.25}},anim:"idle"})}var last_particles=0
function test(dt){uiHandlingNav()
gl.clearColor(0,.72,1,1)
if(1){return}if(!test.color_sprite){test.color_sprite=v4clone(color_white)
test.character={x:Math.random()*(game_width-sprite_size-200)+sprite_size*.5+200,y:Math.random()*(game_height-sprite_size)+sprite_size*.5}}if(flagGet("ui_test")){ui_test.run(10,10,Z.UI_TEST)}if(flagGet("font_test")){ui_test.runFontTest(105,20)}if(flagGet("lines")){lineTest()}test.character.dx=0
test.character.dy=0
if(!uiHandlingNav()){test.character.dx-=input.keyDown(KEYS.LEFT)+input.keyDown(KEYS.A)+input.padButtonDown(PAD.LEFT)
test.character.dx+=input.keyDown(KEYS.RIGHT)+input.keyDown(KEYS.D)+input.padButtonDown(PAD.RIGHT)
test.character.dy-=input.keyDown(KEYS.UP)+input.keyDown(KEYS.W)+input.padButtonDown(PAD.UP)
test.character.dy+=input.keyDown(KEYS.DOWN)+input.keyDown(KEYS.S)+input.padButtonDown(PAD.DOWN)}if(test.character.dx<0){sprites.animation.setState("idle_left")
if(spine_anim){spine_anim.setAnimation(0,"run_left",true)}}else if(test.character.dx>0){sprites.animation.setState("idle_right")
if(spine_anim){spine_anim.setAnimation(0,"run",true)}}else if(spine_anim){if(spine_anim.getAnimation(0)==="run"){spine_anim.setAnimation(0,"idle",true)}else if(spine_anim.getAnimation(0)==="run_left"){spine_anim.setAnimation(0,"idle_left",true)}}test.character.x+=test.character.dx*.05
test.character.y+=test.character.dy*.05
var bounds={x:test.character.x-sprite_size/2,y:test.character.y-sprite_size/2,w:sprite_size,h:sprite_size}
if(input.mouseDownOverBounds(bounds)){v4copy(test.color_sprite,color_yellow)}else if(input.click(bounds)){v4copy(test.color_sprite,test.color_sprite[2]===0?color_white:color_red)
soundPlay("test")}else if(input.mouseOver(bounds)){v4copy(test.color_sprite,color_white)
test.color_sprite[3]=.5}else{v4copy(test.color_sprite,color_white)
test.color_sprite[3]=1}if(flagGet("spine")){if(!spine_inited){spineInit()}spine_anim.update(dt*2)
spine_anim.draw({x:test.character.x,y:test.character.y,z:Z.SPRITES,scale:.25})}else{sprites.test_tint.drawDualTint({x:test.character.x,y:test.character.y,z:Z.SPRITES,color:[1,1,0,1],color1:[1,0,1,1],frame:sprites.animation.getFrame(dt)})}if(flagGet("4color")){sprites.test_tint.draw4Color({x:test.character.x,y:test.character.y+64,z:Z.SPRITES,c0:[1,0,0,1],c1:[0,1,0,1],c2:[0,0,1,1],c3:[1,0,1,1],frame:sprites.animation.getFrame()})}var font_test_idx=0
ui.print(glov_font.styleColored(null,255),test.character.x,test.character.y+ ++font_test_idx*20,Z.SPRITES,"TEXT!")
var font_style=glov_font.style(null,{outline_width:1,outline_color:2147483903,glow_xoffs:3.25,glow_yoffs:3.25,glow_inner:-2.5,glow_outer:5,glow_color:255})
ui.print(font_style,test.character.x,test.character.y+ ++font_test_idx*ui.font_height,Z.SPRITES,"Outline and Drop Shadow")
var x=ui.button_height
var button_spacing=ui.button_height+2
var y=game_height-10-button_spacing*7
var mini_button_w=floor((ui.button_width-2)/2)
function miniButton(text,tooltip,active){var ret=ui.buttonText({x:x,y:y,text:text,tooltip:tooltip,w:mini_button_w,colors:active?colors_active:colors_inactive})
x+=2+mini_button_w
if(x>=ui.button_width){x=ui.button_height
y+=button_spacing}return ret}if(ui.buttonText({x:x,y:y,text:"Pixely: "+(flagGet("pixely")||"Off"),tooltip:"Toggles pixely or regular mode (requires reload)"})){if(flagGet("pixely")==="strict"){flagSet("pixely",false)}else if(flagGet("pixely")==="on"){flagSet("pixely","strict")}else{flagSet("pixely","on")}if(document.location.reload){document.location.reload()}else{document.location=String(document.location)}}y+=button_spacing
var rs3d_disabled=!flagGet("3d_test")||engine.render_width
if(ui.buttonText({x:x,y:y,text:"RenderScale3D: "+(rs3d_disabled?"":settings.render_scale),tooltip:"Changes render_scale",disabled:rs3d_disabled})){if(settings.render_scale===1){settings.set("render_scale",.25)}else{settings.set("render_scale",1)}}y+=button_spacing
if(ui.buttonText({x:x,y:y,text:"RenderScaleAll: "+settings.render_scale_all,tooltip:"Changes render_scale_all"})){if(settings.render_scale_all===1){settings.set("render_scale_all",.5)}else{settings.set("render_scale_all",1)}}y+=button_spacing
font.drawSizedAligned(null,x,y,Z.UI,ui.font_height,font.ALIGN.HCENTER,ui.button_width,0,"Tests")
y+=ui.font_height+1
var do_3d=flagGet("3d_test")
if(miniButton("3D","Toggles visibility of a 3D test",flagGet("3d_test"))){flagToggle("3d_test")
transition.queue(Z.TRANSITION_FINAL,transition.fade(500))}if(miniButton("Font","Toggles visibility of general Font tests",flagGet("font_test"))){flagToggle("font_test")
transition.queue(Z.TRANSITION_FINAL,transition.randomTransition())}if(miniButton("UI","Toggles visibility of general UI tests",flagGet("ui_test"))){flagToggle("ui_test")
if(flagGet("ui_test")){flagSet("lines",false)}}if(miniButton("Lines","Toggles line drawing",flagGet("lines"))){flagToggle("lines")
if(flagGet("lines")){flagSet("ui_test",false)}}if(miniButton("FX","Toggles particles",flagGet("particles"))){flagToggle("particles")}if(miniButton("Music","Toggles playing a looping background music track",flagGet("music"))){flagToggle("music")
if(flagGet("music")){soundPlayMusic(music_file,1,FADE_IN)}else{soundPlayMusic(music_file,0,FADE_OUT)}}if(miniButton("Spine","Toggles Spine animation testing",flagGet("spine"))){flagToggle("spine")}if(flagGet("particles")){if(engine.getFrameTimestamp()-last_particles>1e3){last_particles=engine.getFrameTimestamp()
engine.glov_particles.createSystem(particle_data.defs.explosion,[100+Math.random()*120,100+Math.random()*140,Z.PARTICLES])}}if(flagGet("perf_test")){perfTestSprites()}if(do_3d){test3D()}}function testInit(dt){engine.setState(test)
if(flagGet("music")){soundPlayMusic(music_file)}test(dt)}initGraphics()
engine.setState(testInit)}

},{"../glov/client/engine.js":20,"../glov/client/font.js":26,"../glov/client/input.js":36,"../glov/client/local_storage.js":38,"../glov/client/net.js":43,"../glov/client/particles.js":45,"../glov/client/settings.js":55,"../glov/client/slider.js":59,"../glov/client/sound.js":61,"../glov/client/spine.js":62,"../glov/client/sprite_animation.js":64,"../glov/client/sprites.js":65,"../glov/client/transition.js":68,"../glov/client/ui.js":69,"../glov/client/ui_test.js":70,"../glov/common/vmath.js":91,"./img/font/04b03_8x1.json":3,"./img/font/04b03_8x2.json":4,"./img/font/palanquin32.json":5,"./particle_data.js":8,"./test_3d.js":9}],7:[function(require,module,exports){
"use strict"
exports.game_width=exports.game_height=void 0
exports.main=main
exports.sprites=void 0
var _glovClientLocal_storageJs=require("../glov/client/local_storage.js")
var local_storage=_glovClientLocal_storageJs
local_storage.setStoragePrefix("glovjs-multiplayer")
var _assert=require("assert")
var assert=_assert
var _glovClientCmdsJs=require("../glov/client/cmds.js")
var cmd_parse=_glovClientCmdsJs.cmd_parse
var _glovClientEngineJs=require("../glov/client/engine.js")
var engine=_glovClientEngineJs
var _glovClientFontJs=require("../glov/client/font.js")
var glov_font=_glovClientFontJs
var _glovClientInputJs=require("../glov/client/input.js")
var input=_glovClientInputJs
var atan2=Math.atan2,random=Math.random
var _glovClientNetJs=require("../glov/client/net.js")
var net=_glovClientNetJs
var _glovClientNet_position_managerJs=require("../glov/client/net_position_manager.js")
var net_position_manager=_glovClientNet_position_managerJs
var _glovClientParticlesJs=require("../glov/client/particles.js")
var particles=_glovClientParticlesJs
var _glovClientShadersJs=require("../glov/client/shaders.js")
var shaders=_glovClientShadersJs
var _glovClientSocialJs=require("../glov/client/social.js")
var socialInit=_glovClientSocialJs.socialInit
var _glovClientSoundJs=require("../glov/client/sound.js")
var soundLoad=_glovClientSoundJs.soundLoad
var soundPlay=_glovClientSoundJs.soundPlay
var _glovClientSprite_animationJs=require("../glov/client/sprite_animation.js")
var sprite_animation=_glovClientSprite_animationJs
var _glovClientSpritesJs=require("../glov/client/sprites.js")
var glov_sprites=_glovClientSpritesJs
var _glovClientUiJs=require("../glov/client/ui.js")
var ui=_glovClientUiJs
var _glovClientUiJs2=require("../glov/client/ui.js")
var uiHandlingNav=_glovClientUiJs2.uiHandlingNav
var _glovCommonUtilJs=require("../glov/common/util.js")
var toNumber=_glovCommonUtilJs.toNumber
var _glovCommonVmathJs=require("../glov/common/vmath.js")
var v2sub=_glovCommonVmathJs.v2sub
var v4copy=_glovCommonVmathJs.v4copy
var vec2=_glovCommonVmathJs.vec2
var vec3=_glovCommonVmathJs.vec3
var vec4=_glovCommonVmathJs.vec4
var _account_uiJs=require("./account_ui.js")
var createAccountUI=_account_uiJs.createAccountUI
var _particle_dataJs=require("./particle_data.js")
var particle_data=_particle_dataJs
window.Z=window.Z||{}
Z.BACKGROUND=1
Z.SPRITES=10
Z.PARTICLES=20
var app=exports
window.app=app
var pos_manager=net_position_manager.create({n:3,dim_pos:2,dim_rot:1})
var ROOM_REQUIRES_LOGIN=true
var game_width=1280
exports.game_width=game_width
var game_height=960
exports.game_height=game_height
var sprites={}
exports.sprites=sprites
cmd_parse.register({cmd:"bin_get",func:function func(str,resp_func){app.chat_ui.channel.pak("bin_get").send(function(err,pak){if(err){return void resp_func(err)}resp_func(null,pak.readBuffer(false).join(","))})}})
cmd_parse.register({cmd:"bin_set",func:function func(str,resp_func){var pak=app.chat_ui.channel.pak("bin_set")
pak.writeBuffer(new Uint8Array(str.split(" ").map(toNumber)))
pak.send(resp_func)}})
function main(){net.init({engine:engine,cmd_parse:cmd_parse,auto_create_user:false})
if(!engine.startup({game_width:game_width,game_height:game_height,pixely:false,font:{info:require("./img/font/palanquin32.json"),texture:"font/palanquin32"},safearea_ignore_bottom:true,ui_sounds:{msg_err:"msg_err",msg_in:"msg_in",msg_out:"msg_out",msg_out_err:"msg_out_err",user_join:"user_join",user_leave:"user_leave"}})){return}socialInit()
var test_shader=shaders.create("shaders/test.fp")
var createSprite=glov_sprites.create
var createAnimation=sprite_animation.create
app.account_ui=createAccountUI()
app.chat_ui=require("../glov/client/chat_ui.js").create({max_len:1e3})
var color_white=vec4(1,1,1,1)
var color_gray=vec4(.5,.5,.5,1)
var color_red=vec4(1,0,0,1)
var color_yellow=vec4(1,1,0,1)
var KEYS=input.KEYS
var PAD=input.PAD
var sprite_size=64
function initGraphics(){particles.preloadParticleData(particle_data)
soundLoad("test")
sprites.white=createSprite({url:"white"})
sprites.test=createSprite({name:"test",size:vec2(sprite_size,sprite_size),origin:vec2(.5,.5)})
sprites.test_tint=createSprite({name:"tinted",ws:[16,16,16,16],hs:[16,16,16],size:vec2(sprite_size,sprite_size),layers:2,origin:vec2(.5,.5)})
sprites.animation=createAnimation({idle_left:{frames:[0,1],times:[200,500]},idle_right:{frames:[3,2],times:[200,500]}})
sprites.animation.setState("idle_left")
sprites.game_bg=createSprite({url:"white",size:vec2(game_width,game_height)})}var test_room
var _test
function playerMotion(dt){if(pos_manager.checkNet(function(pos){_test.character.x=pos[0]
_test.character.y=pos[1]
_test.character.rot=pos[2]})){return}if(uiHandlingNav()){return}_test.character.dx=0
_test.character.dx-=input.keyDown(KEYS.LEFT)+input.keyDown(KEYS.A)+input.padButtonDown(PAD.LEFT)
_test.character.dx+=input.keyDown(KEYS.RIGHT)+input.keyDown(KEYS.D)+input.padButtonDown(PAD.RIGHT)
_test.character.dy=0
_test.character.dy-=input.keyDown(KEYS.UP)+input.keyDown(KEYS.W)+input.padButtonDown(PAD.UP)
_test.character.dy+=input.keyDown(KEYS.DOWN)+input.keyDown(KEYS.S)+input.padButtonDown(PAD.DOWN)
if(_test.character.dx<0){sprites.animation.setState("idle_left")}else if(_test.character.dx>0){sprites.animation.setState("idle_right")}_test.character.x+=_test.character.dx*.2
_test.character.y+=_test.character.dy*.2
var bounds={x:_test.character.x-sprite_size/2,y:_test.character.y-sprite_size/2,w:sprite_size,h:sprite_size}
if(input.mouseDownOverBounds(bounds)){v4copy(_test.color_sprite,color_yellow)}else if(input.click(bounds)){v4copy(_test.color_sprite,_test.color_sprite[2]===0?color_white:color_red)
soundPlay("test")}else if(input.mouseOver(bounds)){v4copy(_test.color_sprite,color_white)
_test.color_sprite[3]=.5}else{v4copy(_test.color_sprite,color_white)
_test.color_sprite[3]=1}var aim=v2sub(vec2(),input.mousePos(),[_test.character.x,_test.character.y])
_test.character.rot=atan2(aim[0],-aim[1])
pos_manager.updateMyPos(new Float64Array([_test.character.x,_test.character.y,_test.character.rot]),"idle")}function getRoom(){if(!test_room){test_room=net.subs.getChannel("test.test",true)
pos_manager.reinit({channel:test_room,default_pos:vec3(random()*(game_width-sprite_size)+sprite_size*.5,random()*(game_height-sprite_size)+sprite_size*.5,0)})
app.chat_ui.setChannel(test_room)}}function preLogout(){if(test_room){assert(test_room.subscriptions)
net.subs.unsubscribe(test_room.channel_id)
app.chat_ui.setChannel(null)
test_room=null
if(!ROOM_REQUIRES_LOGIN){setTimeout(getRoom,1)}}}_test=function test(dt){app.chat_ui.run()
app.account_ui.showLogin({x:0,y:0,prelogout:preLogout,center:false,style:glov_font.style(null,{outline_width:2,outline_color:4294967295,color:255})})
if(!_test.color_sprite){_test.color_sprite=v4copy(vec4(),color_white)
_test.character={x:0,y:0,rot:0}}if(test_room&&test_room.subscriptions){playerMotion(dt)
sprites.game_bg.draw({x:0,y:0,z:Z.BACKGROUND,color:[.5,.6,.7,1],shader:test_shader,shader_params:{params:[1,1,1,engine.getFrameTimestamp()*5e-4%1e3]}})
sprites.test_tint.drawDualTint({x:_test.character.x,y:_test.character.y,z:Z.SPRITES,rot:_test.character.rot,color:[1,1,0,1],color1:[1,0,1,1],size:[sprite_size,sprite_size],frame:sprites.animation.getFrame(dt)})
var room_clients=test_room.getChannelData("public.clients",{})
for(var client_id in room_clients){var other_client=room_clients[client_id]
if(other_client.pos&&other_client.ids){var pcd=pos_manager.updateOtherClient(client_id,dt)
if(pcd){var pos=pcd.pos
sprites.test.draw({x:pos[0],y:pos[1],z:Z.SPRITES-1,rot:pos[2],color:color_gray})
ui.font.drawSizedAligned(glov_font.styleColored(null,128),pos[0],pos[1]-64,Z.SPRITES-1,ui.font_height,glov_font.ALIGN.HCENTER,0,0,other_client.ids.display_name||"client_"+client_id)}}}}app.chat_ui.runLate()}
function testInit(dt){engine.setState(_test)
if(!ROOM_REQUIRES_LOGIN){getRoom()}net.subs.onLogin(getRoom)
_test(dt)}initGraphics()
engine.setState(testInit)}

},{"../glov/client/chat_ui.js":14,"../glov/client/cmds.js":16,"../glov/client/engine.js":20,"../glov/client/font.js":26,"../glov/client/input.js":36,"../glov/client/local_storage.js":38,"../glov/client/net.js":43,"../glov/client/net_position_manager.js":44,"../glov/client/particles.js":45,"../glov/client/shaders.js":57,"../glov/client/social.js":60,"../glov/client/sound.js":61,"../glov/client/sprite_animation.js":64,"../glov/client/sprites.js":65,"../glov/client/ui.js":69,"../glov/common/util.js":89,"../glov/common/vmath.js":91,"./account_ui.js":1,"./img/font/palanquin32.json":5,"./particle_data.js":8,"assert":undefined}],8:[function(require,module,exports){
"use strict"
exports.defs=void 0
var defs={}
exports.defs=defs
defs.explosion={particles:{part0:{blend:"alpha",texture:"particles/circle64",color:[1,1,1,1],color_track:[{t:0,v:[1,1,1,0]},{t:.2,v:[1,1,1,1]},{t:.4,v:[1,1,.5,.5]},{t:1,v:[1,0,0,0]}],size:[[48,8],[48,8]],size_track:[{t:0,v:[1,1]},{t:.2,v:[2,2]},{t:.4,v:[1,1]},{t:1,v:[1.5,1.5]}],accel:[0,0,0],rot:[0,360],rot_vel:[10,2],lifespan:[2500,0],kill_time_accel:5}},emitters:{part0:{particle:"part0",pos:[[-16,32],[-16,32],0],vel:[0,0,0],emit_rate:[15,0],emit_time:[0,1e3],emit_initial:10,max_parts:Infinity}},system_lifespan:2500}

},{}],9:[function(require,module,exports){
"use strict"
exports.test3D=test3D
var _glMat4LookAt=require("gl-mat4/lookAt")
var mat4LookAt=_glMat4LookAt
var _glovClientEngineJs=require("../glov/client/engine.js")
var engine=_glovClientEngineJs
var _glovClientMat4ScaleRotateTranslateJs=require("../glov/client/mat4ScaleRotateTranslate.js")
var mat4ScaleRotateTranslate=_glovClientMat4ScaleRotateTranslateJs
var _glovClientModelsJs=require("../glov/client/models.js")
var models=_glovClientModelsJs
var _glovClientQuatJs=require("../glov/client/quat.js")
var qRotateZ=_glovClientQuatJs.qRotateZ
var quat=_glovClientQuatJs.quat
var _glovClientTexturesJs=require("../glov/client/textures.js")
var textures=_glovClientTexturesJs
var _glovCommonVmathJs=require("../glov/common/vmath.js")
var mat4=_glovCommonVmathJs.mat4
var zaxis=_glovCommonVmathJs.zaxis
var zero_vec=_glovCommonVmathJs.zero_vec
var mat_view=mat4()
var mat_obj=mat4()
var rot=quat()
function test3D(){if(!models.models.box){models.startup()}engine.start3DRendering()
mat4LookAt(mat_view,[5,4,3],zero_vec,zaxis)
engine.setGlobalMatrices(mat_view)
qRotateZ(rot,rot,engine.frame_dt*.001)
textures.bind(0,textures.textures.error)
mat4ScaleRotateTranslate(mat_obj,1,rot,[1,1,.03])
models.models.box.draw(mat_obj)
mat4ScaleRotateTranslate(mat_obj,1,rot,[0,0,0])
models.models.box.draw(mat_obj)
mat4ScaleRotateTranslate(mat_obj,1,rot,[1,0,.01])
models.models.box.draw(mat_obj)
mat4ScaleRotateTranslate(mat_obj,1,rot,[0,1,.02])
models.models.box.draw(mat_obj)}

},{"../glov/client/engine.js":20,"../glov/client/mat4ScaleRotateTranslate.js":41,"../glov/client/models.js":42,"../glov/client/quat.js":51,"../glov/client/textures.js":67,"../glov/common/vmath.js":91,"gl-mat4/lookAt":undefined}],10:[function(require,module,exports){
"use strict"
require("./polyfill.js")
var debug=document.getElementById("debug")
window.onerror=function(e,file,line,col,errorobj){var msg=String(e)
if(msg==="[object Object]"){try{msg=JSON.stringify(e)}catch(ignored){}msg=msg.slice(0,600)}if(file||line>0||col>0){msg+="\n  at "+file+"("+line+":"+col+")"}if(errorobj&&errorobj.stack){msg=""+errorobj.stack
if(errorobj.message){if(msg.indexOf(errorobj.message)===-1){msg=errorobj.message+"\n"+msg}}var origin=document.location.origin||""
if(origin){if(origin.slice(-1)!=="/"){origin+="/"}msg=msg.split(origin).join("")}msg=msg.replace(/\[\d+\]<\/?/g,"").replace(/\/</g,"").replace(/<?\/<?/g,"/").replace(/\n\//g,"\n").replace(/\n([^ ])/g,"\n  $1")}if(msg.indexOf("Error:")===-1){msg="Error: "+msg}if(errorobj&&errorobj.type){if(errorobj.type==="unhandledrejection"){msg="Uncaught (in promise) "+msg}}var show=true
if(window.glov_error_report){show=window.glov_error_report(msg,file,line,col)}if(show){debug.innerText=msg+"\n\nPlease report this error to the developer,"+" and then reload this page or restart the app."}}
window.addEventListener("unhandledrejection",function(event){var errorobj=event.reason
if(!errorobj){return}if(!errorobj||typeof errorobj!=="object"){errorobj={stack:errorobj}}errorobj.type=event.type
window.onerror(event.reason,undefined,0,0,errorobj)})
window.debugmsg=function(msg,clear){if(clear){debug.innerText=msg}else{debug.innerText+=msg+"\n"}}
window.profilerStart=window.profilerStop=window.profilerStopStart=function nop(){}

},{"./polyfill.js":48}],11:[function(require,module,exports){
"use strict"
exports.is_windows_phone=exports.is_webkit=exports.is_mac_osx=exports.is_ios_safari=exports.is_ios=exports.is_firefox=exports.is_discrete_gpu=exports.is_android=void 0
var ua=window.navigator.userAgent
var is_mac_osx=ua.match(/Mac OS X/)
exports.is_mac_osx=is_mac_osx
var is_ios=!window.MSStream&&ua.match(/iPad|iPhone|iPod/)
exports.is_ios=is_ios
var is_windows_phone=ua.match(/windows phone/i)
exports.is_windows_phone=is_windows_phone
var is_android=!is_windows_phone&&ua.match(/android/i)
exports.is_android=is_android
var is_webkit=ua.match(/WebKit/i)
exports.is_webkit=is_webkit
var is_ios_safari=is_ios&&is_webkit&&!ua.match(/CriOS/i)
exports.is_ios_safari=is_ios_safari
var is_firefox=ua.match(/Firefox/i)
exports.is_firefox=is_firefox
var is_discrete_gpu=false
exports.is_discrete_gpu=is_discrete_gpu
function init(){try{var canvas=document.createElement("canvas")
canvas.width=4
canvas.height=4
var gltest=canvas.getContext("webgl")
if(gltest){var debug_info=gltest.getExtension("WEBGL_debug_renderer_info")
if(debug_info){var renderer_unmasked=gltest.getParameter(debug_info.UNMASKED_RENDERER_WEBGL)
exports.is_discrete_gpu=is_discrete_gpu=Boolean(renderer_unmasked&&renderer_unmasked.match(/nvidia|radeon/i))}}}catch(e){}}init()

},{}],12:[function(require,module,exports){
"use strict"
exports.buildUIStartup=buildUIStartup
var camera2d=require("./camera2d.js")
var engine=require("./engine.js")
var glov_font=require("./font.js")
var min=Math.min
var _require=require("./scroll_area.js"),scrollAreaCreate=_require.scrollAreaCreate
var ui=require("./ui.js")
var net=require("./net.js")
var _require2=require("../common/util.js"),plural=_require2.plural
var _require3=require("../common/vmath.js"),vec4=_require3.vec4
var gbstate
var server_error
Z.BUILD_ERRORS=Z.BUILD_ERRORS||9900
function onGBState(state){gbstate=state}function onServerError(err){server_error=err}var PAD=4
var color_panel=vec4(0,0,0,1)
var style_title=glov_font.styleColored(null,4280295679)
var style=glov_font.styleColored(null,3722305023)
var style_task=glov_font.styleColored(null,14540287)
var style_job=glov_font.styleColored(null,539033599)
var color_line=vec4(1,1,1,1)
var strip_ansi=/\u001b\[(?:[0-9;]*)[0-9A-ORZcf-nqry=><]/g
var scroll_area
function buildUITick(){var _gbstate,_gbstate2
if(!gbstate&&!server_error){return}var x0=camera2d.x0()+PAD
var y0=camera2d.y0()+PAD
var z=Z.BUILD_ERRORS
var w=camera2d.w()*.75
var font=ui.font,title_font=ui.title_font,font_height=ui.font_height
var x=x0
var y=y0
var error_count=(((_gbstate=gbstate)==null?void 0:_gbstate.error_count)||0)+(server_error?1:0)
var warning_count=((_gbstate2=gbstate)==null?void 0:_gbstate2.warning_count)||0
title_font.drawSizedAligned(style_title,x,y,z,font_height,font.ALIGN.HCENTERFIT,w,0,error_count+" "+plural(error_count,"error")+", "+(warning_count+" "+plural(warning_count,"warning")))
y+=font_height+1
ui.drawLine(x0+w*.3,y,x0+w*.7,y,z,.5,true,color_line)
y+=PAD
if(!scroll_area){scroll_area=scrollAreaCreate({z:z,background_color:null,auto_hide:true})}var max_h=camera2d.y1()-PAD-y
var scroll_y_start=y
scroll_area.begin({x:x,y:y,w:w,h:max_h})
var sub_w=w-PAD-scroll_area.barWidth()
y=0
z=Z.UI
function printLine(type,str){str=str.replace(strip_ansi,"")
y+=font.drawSizedWrapped(style,x,y,z,sub_w,0,font_height,type+": "+str)}if(gbstate){for(var task_name in gbstate.tasks){var task=gbstate.tasks[task_name]
x=0
font.drawSizedAligned(style_task,x,y,z,font_height,font.ALIGN.HLEFT,sub_w,0,task_name+":")
y+=font_height
x+=font_height
var printed_any=false
for(var job_name in task.jobs){var job=task.jobs[job_name]
var warnings=job.warnings,errors=job.errors
if(job_name!=="all"){if(job_name.startsWith("source:")){job_name=job_name.slice(7)}y+=font.drawSizedWrapped(style_job,x,y,z,sub_w,0,font_height,job_name)}if(warnings){for(var ii=0;ii<warnings.length;++ii){printLine("Warning",warnings[ii])
printed_any=true}}if(errors){for(var _ii=0;_ii<errors.length;++_ii){printLine("Error",errors[_ii])
printed_any=true}}}if(!printed_any&&task.err){printLine("Error",task.err)}y+=PAD}}if(server_error){x=0
font.drawSizedAligned(style_task,x,y,z,font_height,font.ALIGN.HLEFT,sub_w,0,"Server Error:")
y+=font_height
x+=font_height
printLine("Server error",server_error)}scroll_area.end(y)
y=scroll_y_start+min(max_h,y)
if(ui.buttonText({x:x0+w-ui.button_height,y:y0,z:Z.BUILD_ERRORS+1,w:ui.button_height,text:"X"})){gbstate=null
server_error=null}ui.panel({x:x0-PAD,y:y0-PAD,z:Z.BUILD_ERRORS-1,w:w+PAD*2,h:y-y0+PAD*2,color:color_panel})}function buildUIStartup(){if(net.client&&engine.DEBUG){net.client.onMsg("gbstate",onGBState)
net.client.onMsg("server_error",onServerError)
net.subs.on("connect",function(){var pak=net.client.pak("gbstate_enable")
pak.writeBool(true)
pak.send()})
engine.addTickFunc(buildUITick)}}

},{"../common/util.js":89,"../common/vmath.js":91,"./camera2d.js":13,"./engine.js":20,"./font.js":26,"./net.js":43,"./scroll_area.js":53,"./ui.js":69}],13:[function(require,module,exports){
"use strict"
exports.calcMap=calcMap
exports.canvasToVirtual=canvasToVirtual
exports.clipTestRect=clipTestRect
exports.data=void 0
exports.domDeltaToVirtual=domDeltaToVirtual
exports.domToCanvasRatio=domToCanvasRatio
exports.domToVirtual=domToVirtual
exports.h=h
exports.hReal=hReal
exports.htmlPos=htmlPos
exports.htmlSize=htmlSize
exports.pop=pop
exports.push=push
exports.render_viewport_w=exports.render_viewport_h=exports.render_offset_y_bottom=exports.render_offset_x=void 0
exports.safeAreaPadding=safeAreaPadding
exports.screenAspect=screenAspect
exports.set=set
exports.setAspectFixed=setAspectFixed
exports.setAspectFixed2=setAspectFixed2
exports.setDOMMapped=setDOMMapped
exports.setInputClipping=setInputClipping
exports.setNormalized=setNormalized
exports.setSafeAreaPadding=setSafeAreaPadding
exports.setScreen=setScreen
exports.shift=shift
exports.startup=startup
exports.tickCamera2D=tickCamera2D
exports.transformX=transformX
exports.transformY=transformY
exports.virtualToCanvas=virtualToCanvas
exports.virtualToDom=virtualToDom
exports.virtualToDomPosParam=virtualToDomPosParam
exports.virtualToFontSize=virtualToFontSize
exports.w=w
exports.wReal=wReal
exports.x0=x0
exports.x0Real=x0Real
exports.x1=x1
exports.x1Real=x1Real
exports.xScale=xScale
exports.y0=y0
exports.y0Real=y0Real
exports.y1=y1
exports.y1Real=y1Real
exports.yScale=yScale
exports.zoom=zoom
var engine=require("./engine.js")
var max=Math.max,round=Math.round
var safearea_pad=new Float32Array(4)
var data=new Float32Array(13)
exports.data=data
var screen_width
var screen_height
var render_width
var render_height
var render_viewport_w
exports.render_viewport_w=render_viewport_w
var render_viewport_h
exports.render_viewport_h=render_viewport_h
var render_offset_x
exports.render_offset_x=render_offset_x
var render_offset_y_top
var render_offset_y_bottom
exports.render_offset_y_bottom=render_offset_y_bottom
function reapply(){if(render_width){data[4]=render_width/(data[2]-data[0])
data[5]=render_height/(data[3]-data[1])
data[7]=(data[2]-data[0])/render_viewport_w
data[8]=(data[3]-data[1])/render_viewport_h}else{data[4]=screen_width/(data[2]-data[0])
data[5]=screen_height/(data[3]-data[1])}}function virtualToCanvas(dst,src){dst[0]=(src[0]-data[0])*data[4]
dst[1]=(src[1]-data[1])*data[5]}function transformX(x){return(x-data[0])*data[4]}function transformY(y){return(y-data[1])*data[5]}function canvasToVirtual(dst,src){dst[0]=src[0]/data[4]+data[0]
dst[1]=src[1]/data[5]+data[1]}function safeScreenWidth(){return max(1,screen_width-safearea_pad[0]-safearea_pad[1])}function safeScreenHeight(){return max(1,screen_height-safearea_pad[2]-safearea_pad[3])}function set(x0,y0,x1,y1,ignore_safe_area){if(ignore_safe_area||render_width){data[9]=data[0]=x0
data[10]=data[1]=y0
data[11]=data[2]=x1
data[12]=data[3]=y1}else{data[9]=x0
data[10]=y0
data[11]=x1
data[12]=y1
var wscale=(x1-x0)/safeScreenWidth()
var hscale=(y1-y0)/safeScreenHeight()
data[0]=x0-safearea_pad[0]*wscale
data[1]=y0-safearea_pad[2]*hscale
data[2]=x1+safearea_pad[1]*wscale
data[3]=y1+safearea_pad[3]*hscale}reapply()}function setSafeAreaPadding(left,right,top,bottom){safearea_pad[0]=round(left)
safearea_pad[1]=round(right)
safearea_pad[2]=round(top)
safearea_pad[3]=round(bottom)}function safeAreaPadding(){return safearea_pad}var stack=[]
function push(){stack.push(data.slice(0))}function pop(){var old=stack.pop()
for(var ii=0;ii<old.length;++ii){data[ii]=old[ii]}reapply()}function domToCanvasRatio(){return data[6]}function screenAspect(){return safeScreenWidth()/safeScreenHeight()}function setAspectFixed(w,h){var pa=render_width?1:engine.pixel_aspect
var inv_aspect=h/pa/w
var inv_desired_aspect
if(render_width){inv_desired_aspect=render_height/render_width}else{inv_desired_aspect=1/screenAspect()}if(inv_aspect>inv_desired_aspect){var margin=(h/pa/inv_desired_aspect-w)/2
set(-margin,0,w+margin,h,false)}else{var _margin=(w*pa*inv_desired_aspect-h)/2
set(0,-_margin,w,h+_margin,false)}}function setAspectFixed2(w,h){var pa=render_width?1:engine.pixel_aspect
var inv_aspect=h/pa/w
var inv_desired_aspect
if(render_width){inv_desired_aspect=render_height/render_width}else{inv_desired_aspect=1/screenAspect()}if(inv_aspect>inv_desired_aspect){var margin=h/pa/inv_desired_aspect-w
set(0,0,w+margin,h,false)}else{var _margin2=w*pa*inv_desired_aspect-h
set(0,0,w,h+_margin2,false)}}function zoom(x,y,factor){var inv_factor=1/factor
set(x-(x-data[0])*inv_factor,y-(y-data[1])*inv_factor,x+(data[2]-x)*inv_factor,y+(data[3]-y)*inv_factor,true)}function shift(dx,dy){set(data[0]+dx,data[1]+dy,data[2]+dx,data[3]+dy,true)}function calcMap(out,src_rect,dest_rect){var cur_w=data[11]-data[9]
var cur_h=data[12]-data[10]
var vx0=(src_rect[0]-data[0])/cur_w
var vy0=(src_rect[1]-data[1])/cur_h
var vx1=(src_rect[2]-data[0])/cur_w
var vy1=(src_rect[3]-data[1])/cur_h
var vw=vx1-vx0
var vh=vy1-vy0
var dest_vw=dest_rect[2]-dest_rect[0]
var dest_vh=dest_rect[3]-dest_rect[1]
out[0]=dest_rect[0]-dest_vw/vw*vx0
out[1]=dest_rect[1]-dest_vh/vh*vy0
out[2]=dest_rect[2]+dest_vw/vw*(1-vx1)
out[3]=dest_rect[3]+dest_vh/vh*(1-vy1)
return out}function setNormalized(){set(0,0,1,1,true)}function setScreen(no_dpi_aware){if(render_width){set(0,0,render_width,render_height)}else if(no_dpi_aware){set(0,0,safeScreenWidth(),safeScreenHeight())}else{set(0,0,safeScreenWidth()/engine.dom_to_canvas_ratio,safeScreenHeight()/engine.dom_to_canvas_ratio)}}function setDOMMapped(){if(render_width){set(render_offset_x,render_offset_y_top,screen_width-render_offset_x,screen_height-render_offset_y_top,true)}else{set(0,0,screen_width/engine.dom_to_canvas_ratio,screen_height/engine.dom_to_canvas_ratio,true)}}function x0Real(){return data[0]}function y0Real(){return data[1]}function x1Real(){return data[2]}function y1Real(){return data[3]}function wReal(){return data[2]-data[0]}function hReal(){return data[3]-data[1]}function x0(){return data[9]}function y0(){return data[10]}function x1(){return data[11]}function y1(){return data[12]}function w(){return data[11]-data[9]}function h(){return data[12]-data[10]}function xScale(){return data[4]}function yScale(){return data[5]}function htmlPos(x,y){if(render_width){return[100*(((x-data[0])/data[7]+render_offset_x)/screen_width),100*(((y-data[1])/data[8]+render_offset_y_top)/screen_height)]}else{return[100*(x-data[0])/(data[2]-data[0]),100*(y-data[1])/(data[3]-data[1])]}}function htmlSize(w,h){if(render_width){return[100*w/data[7]/screen_width,100*h/data[8]/screen_height]}else{return[100*w/(data[2]-data[0]),100*h/(data[3]-data[1])]}}var input_clipping
function setInputClipping(xywh){input_clipping=xywh}function domToVirtual(dst,src){var ret=true
if(input_clipping){if(src[0]<input_clipping[0]||src[0]>input_clipping[0]+input_clipping[2]||src[1]<input_clipping[1]||src[1]>input_clipping[1]+input_clipping[3]){ret=false}}if(render_width){dst[0]=(src[0]*data[6]-render_offset_x)*data[7]+data[0]
dst[1]=(src[1]*data[6]-render_offset_y_top)*data[8]+data[1]}else{dst[0]=src[0]*data[6]/data[4]+data[0]
dst[1]=src[1]*data[6]/data[5]+data[1]}return ret}function domDeltaToVirtual(dst,src){if(render_width){dst[0]=src[0]*data[6]*data[7]
dst[1]=src[1]*data[6]*data[8]}else{dst[0]=src[0]*data[6]/data[4]
dst[1]=src[1]*data[6]/data[5]}}var input_clipping_virtual=new Float32Array(4)
function updateVirtualInputClipping(){domToVirtual(input_clipping_virtual,input_clipping)
if(render_width){input_clipping_virtual[2]=input_clipping[2]*data[6]*data[7]
input_clipping_virtual[3]=input_clipping[3]*data[6]*data[8]}else{input_clipping_virtual[2]=input_clipping[2]*data[6]/data[4]
input_clipping_virtual[3]=input_clipping[3]*data[6]/data[5]}}function virtualToDom(dst,src){if(render_width){dst[0]=(render_offset_x+(src[0]-data[0])/data[7])/data[6]
dst[1]=(render_offset_y_top+(src[1]-data[1])/data[8])/data[6]}else{dst[0]=(src[0]-data[0])*data[4]/data[6]
dst[1]=(src[1]-data[1])*data[5]/data[6]}}function virtualToFontSize(height){if(render_width){return height/(data[6]*data[8])*.84}else{return height*data[5]/data[6]*.84}}function virtualToDomPosParam(dst,src){if(render_width){dst.x=(render_offset_x+(src.x-data[0])/data[7])/data[6]
dst.w=src.w/data[7]/data[6]
dst.y=(render_offset_y_top+(src.y-data[1])/data[8])/data[6]
dst.h=src.h/data[8]/data[6]}else{dst.x=(src.x-data[0])*data[4]/data[6]
dst.w=src.w*data[4]/data[6]
dst.y=(src.y-data[1])*data[5]/data[6]
dst.h=src.h*data[5]/data[6]}if(input_clipping){if(dst.x<input_clipping[0]){dst.w=max(0,dst.w-(input_clipping[0]-dst.x))
dst.x=input_clipping[0]}if(dst.y<input_clipping[1]){dst.h=max(0,dst.h-(input_clipping[1]-dst.y))
dst.y=input_clipping[1]}if(dst.x>input_clipping[0]+input_clipping[2]){dst.w=0}if(dst.y>input_clipping[1]+input_clipping[3]){dst.h=0}}}function clipTestRect(rect){if(!input_clipping){return true}updateVirtualInputClipping()
var icv=input_clipping_virtual
if(rect.x>icv[0]+icv[2]||rect.x+rect.w<icv[0]||rect.y>icv[1]+icv[3]||rect.y+rect.h<icv[1]){return false}if(rect.x<icv[0]){rect.w-=icv[0]-rect.x
rect.x=icv[0]}if(rect.y<icv[1]){rect.h-=icv[1]-rect.y
rect.y=icv[1]}if(rect.x+rect.w>icv[0]+icv[2]){rect.w=icv[0]+icv[2]-rect.x}if(rect.y+rect.h>icv[1]+icv[3]){rect.h=icv[1]+icv[3]-rect.y}return true}function tickCamera2D(){data[6]=engine.dom_to_canvas_ratio
screen_width=engine.width
screen_height=engine.height
var viewport=[0,0,screen_width,screen_height]
if(engine.render_width){render_width=engine.render_width
render_height=engine.render_height
var pa=engine.pixel_aspect
var inv_aspect=render_height/pa/render_width
var eff_screen_width=safeScreenWidth()
var eff_screen_height=safeScreenHeight()
var inv_desired_aspect=eff_screen_height/eff_screen_width
if(inv_aspect>inv_desired_aspect){var margin=(render_height/inv_desired_aspect-render_width*pa)/2*eff_screen_height/render_height
exports.render_offset_x=render_offset_x=safearea_pad[0]+round(margin)
render_offset_y_top=safearea_pad[2]
exports.render_offset_y_bottom=render_offset_y_bottom=safearea_pad[3]
exports.render_viewport_w=render_viewport_w=round(eff_screen_width-margin*2)
exports.render_viewport_h=render_viewport_h=eff_screen_height}else{var _margin3=(render_width*inv_desired_aspect-render_height/pa)/2*eff_screen_width/render_width
exports.render_offset_x=render_offset_x=safearea_pad[0]
render_offset_y_top=safearea_pad[2]+round(_margin3)
exports.render_offset_y_bottom=render_offset_y_bottom=safearea_pad[3]+round(_margin3)
exports.render_viewport_w=render_viewport_w=eff_screen_width
exports.render_viewport_h=render_viewport_h=round(eff_screen_height-_margin3*2)}viewport[2]=render_width
viewport[3]=render_height}else{render_width=render_height=0
exports.render_offset_x=render_offset_x=0
render_offset_y_top=0
exports.render_offset_y_bottom=render_offset_y_bottom=0}reapply()
engine.setViewport(viewport)}function startup(){screen_width=engine.width
screen_height=engine.height
set(0,0,engine.width,engine.height)
tickCamera2D()}

},{"./engine.js":20}],14:[function(require,module,exports){
"use strict"
exports.create=create
var assert=require("assert")
var _require=require("glov-async"),asyncParallel=_require.asyncParallel
var camera2d=require("./camera2d.js")
var _require2=require("./cmds.js"),cmd_parse=_require2.cmd_parse
var engine=require("./engine.js")
var glov_font=require("./font.js")
var _require3=require("./social.js"),isFriend=_require3.isFriend
var input=require("./input.js")
var _require4=require("./link.js"),link=_require4.link
var local_storage=require("./local_storage.js")
var _require5=require("./localization.js"),getStringIfLocalizable=_require5.getStringIfLocalizable
var ceil=Math.ceil,floor=Math.floor,max=Math.max,min=Math.min,round=Math.round
var _require6=require("./net.js"),netClient=_require6.netClient,netClientId=_require6.netClientId,netSubs=_require6.netSubs,netUserId=_require6.netUserId
var _require7=require("./words/profanity.js"),profanityFilter=_require7.profanityFilter,profanityStartup=_require7.profanityStartup
var _require8=require("./scroll_area.js"),scrollAreaCreate=_require8.scrollAreaCreate
var settings=require("./settings.js")
var _require9=require("./spot.js"),spotUnfocus=_require9.spotUnfocus
var ui=require("./ui.js")
var _require10=require("../common/util.js"),clamp=_require10.clamp,matchAll=_require10.matchAll
var _require11=require("../common/vmath.js"),vec4=_require11.vec4,v3copy=_require11.v3copy
var FLAG_EMOTE=1
var FLAG_USERCHAT=2
Z.CHAT=Z.CHAT||500
Z.CHAT_FOCUSED=Z.CHAT_FOCUSED||Z.CHAT
var color_user_rollover=vec4(1,1,1,.5)
var MAX_PER_STYLE={join_leave:3}
settings.register({chat_auto_unfocus:{default_value:0,type:cmd_parse.TYPE_INT,range:[0,1],help:"Automatically unfocus chat after sending a message"},chat_show_join_leave:{default_value:1,type:cmd_parse.TYPE_INT,range:[0,1],label:"Show join/leave messages",help:"Show join/leave messages"},profanity_filter:{default_value:1,type:cmd_parse.TYPE_INT,range:[0,1],help:"Filter profanity in chat"}})
function CmdHistory(){assert(local_storage.getStoragePrefix()!=="demo")
this.entries=new Array(50)
this.idx=local_storage.getJSON("console_idx")
if(typeof this.idx!=="number"||this.idx<0||this.idx>=this.entries.length){this.idx=0}else{for(var ii=0;ii<this.entries.length;++ii){this.entries[ii]=local_storage.getJSON("console_e"+ii)}}this.resetPos()}CmdHistory.prototype.setHist=function(idx,text){this.entries[idx]=text
local_storage.setJSON("console_e"+idx,text)}
CmdHistory.prototype.add=function(text){if(!text){return}var idx=this.entries.indexOf(text)
if(idx!==-1){var target=(this.idx-1+this.entries.length)%this.entries.length
while(idx!==target){var next=(idx+1)%this.entries.length
this.setHist(idx,this.entries[next])
idx=next}this.setHist(target,text)
return}this.setHist(this.idx,text)
this.idx=(this.idx+1)%this.entries.length
local_storage.setJSON("console_idx",this.idx)
this.resetPos()}
CmdHistory.prototype.unadd=function(text){var idx=(this.idx-1+this.entries.length)%this.entries.length
if(this.entries[idx]!==text){return}this.idx=idx
local_storage.setJSON("console_idx",this.idx)
this.resetPos()}
CmdHistory.prototype.resetPos=function(){this.hist_idx=this.idx
this.edit_line=""}
CmdHistory.prototype.prev=function(cur_text){if(this.hist_idx===this.idx){this.edit_line=cur_text}var idx=(this.hist_idx-1+this.entries.length)%this.entries.length
var text=this.entries[idx]
if(idx===this.idx||!text){return this.entries[this.hist_idx]||""}this.hist_idx=idx
return text||""}
CmdHistory.prototype.next=function(cur_text){if(this.hist_idx===this.idx){return cur_text||""}var idx=(this.hist_idx+1)%this.entries.length
this.hist_idx=idx
if(this.hist_idx===this.idx){var ret=this.edit_line
this.edit_line=""
return ret||""}return this.entries[idx]||""}
function defaultGetRoles(){var user_public_data
if(netUserId()&&netClient().connected){var _user_public_data,_user_public_data$per
var user_channel=netSubs().getMyUserChannel()
user_public_data=user_channel.data&&user_channel.data.public
if((_user_public_data=user_public_data)!=null&&(_user_public_data$per=_user_public_data.permissions)!=null&&_user_public_data$per.sysadmin){return{sysadmin:1}}}return{}}function ChatUI(params){assert.equal(typeof params,"object")
assert.equal(typeof params.max_len,"number")
this.edit_text_entry=ui.createEditBox({placeholder:"Chat",initial_focus:false,auto_unfocus:true,spatial_focus:false,max_len:params.max_len,text:""})
this.channel=null
this.on_join=this.onMsgJoin.bind(this)
this.on_leave=this.onMsgLeave.bind(this)
this.on_chat=this.onMsgChat.bind(this)
this.on_chat_cb=null
this.handle_cmd_parse=this.handleCmdParse.bind(this)
this.handle_cmd_parse_error=this.handleCmdParseError.bind(this)
cmd_parse.setDefaultHandler(this.handle_cmd_parse_error)
this.clearChat()
this.max_lines=params.max_lines||8
this.max_messages=params.max_messages||1e3
this.max_len=params.max_len
this.font_height=params.font_height||ui.font_height
this.hide_disconnected_message=params.hide_disconnected_message||false
this.disconnected_message_top=params.disconnected_message_top||false
this.scroll_area=scrollAreaCreate({background_color:null,auto_scroll:true})
this.w=params.w||engine.game_width/2
this.h=params.h||engine.game_height/2
this.inner_width_adjust=params.inner_width_adjust||0
this.border=params.border||undefined
this.volume_join_leave=params.volume_join_leave||.15
this.volume_in=params.volume_in||.5
this.volume_out=params.volume_out||.5
this.msg_out_err_delay=params.msg_out_err_delay||0
this.history=new CmdHistory
this.get_roles=defaultGetRoles
this.url_match=params.url_match
this.url_info=params.url_info
this.user_context_cb=params.user_context_cb
this.fade_start_time=params.fade_start_time||[1e4,1e3]
this.fade_time=params.fade_time||[1e3,500]
this.setActiveSize(this.font_height,this.w)
var outline_width=params.outline_width||1
this.styles={def:glov_font.style(null,{color:4008636159,outline_width:outline_width,outline_color:255}),system:glov_font.style(null,{color:2863311615,outline_width:outline_width,outline_color:255}),error:glov_font.style(null,{color:3707764991,outline_width:outline_width,outline_color:255}),link:glov_font.style(null,{color:1346437119,outline_width:outline_width,outline_color:255}),link_hover:glov_font.style(null,{color:65535,outline_width:outline_width,outline_color:255})}
this.styles.join_leave=this.styles.system
netSubs().on("chat_broadcast",this.onChatBroadcast.bind(this))}ChatUI.prototype.setActiveSize=function(font_height,w){var wrap_w=w-this.scroll_area.barWidth()
if(this.active_font_height!==font_height||this.wrap_w!==wrap_w){this.active_font_height=font_height
this.indent=round(this.active_font_height/24*40)
this.wrap_w=wrap_w
this.total_lines=0
for(var ii=0;ii<this.msgs.length;++ii){var elem=this.msgs[ii]
elem.numlines=ui.font.numLines(this.styles[elem.style]||this.styles.def,this.wrap_w,this.indent,this.active_font_height,elem.msg_text)
this.total_lines+=elem.numlines}}}
ChatUI.prototype.clearChat=function(){this.msgs=[]
this.total_lines=0}
function notHidden(msg){return!msg.hidden}ChatUI.prototype.addMsgInternal=function(elem){elem.timestamp=elem.timestamp||Date.now()
if(elem.flags&FLAG_USERCHAT){if(elem.flags&FLAG_EMOTE){elem.msg_text=elem.display_name+" "+elem.msg}else{elem.msg_text="["+elem.display_name+"] "+elem.msg}}else{elem.msg_text=elem.msg}elem.numlines=ui.font.numLines(this.styles[elem.style]||this.styles.def,this.wrap_w,this.indent,this.active_font_height,elem.msg_text)
this.total_lines+=elem.numlines
this.msgs.push(elem)
var max_msgs=MAX_PER_STYLE[elem.style]
if(max_msgs){for(var ii=this.msgs.length-2;ii>=0;--ii){var elem2=this.msgs[ii]
if(elem2.style===elem.style&&!elem2.hidden){if(elem.id&&elem2.id===elem.id){elem2.hidden=true
this.total_lines-=elem2.numlines
elem2.numlines=0}else{--max_msgs
if(max_msgs<=0){elem2.hidden=true
this.total_lines-=elem2.numlines
elem2.numlines=0
break}}}}}if(this.msgs.length>this.max_messages*1.25){this.msgs=this.msgs.filter(notHidden)
if(this.msgs.length>this.max_messages*1.25){this.msgs.splice(0,this.msgs.length-this.max_messages)
this.total_lines=0
for(var _ii=0;_ii<this.msgs.length;++_ii){this.total_lines+=this.msgs[_ii].numlines}}}}
function toStr(val){val=getStringIfLocalizable(val)
return typeof val==="string"?val:JSON.stringify(val)}ChatUI.prototype.addChat=function(msg,style){msg=toStr(msg)
console.log(msg)
this.addMsgInternal({msg:msg,style:style})}
ChatUI.prototype.addChatFiltered=function(data){data.msg=toStr(data.msg)
console.log("Chat from "+data.id+": "+data.msg)
if(settings.profanity_filter&&data.id!==(netUserId()||netClientId())){data.msg=profanityFilter(data.msg)}this.addMsgInternal(data)}
ChatUI.prototype.onMsgJoin=function(data){if(!settings.chat_show_join_leave){return}if(data.client_id!==netClientId()){if(this.volume_join_leave){ui.playUISound("user_join",this.volume_join_leave)}this.addChatFiltered({id:data.user_id||data.client_id,display_name:data.display_name||data.client_id,flags:FLAG_EMOTE|FLAG_USERCHAT,msg:"joined the channel",style:"join_leave"})}}
ChatUI.prototype.onMsgLeave=function(data){if(!settings.chat_show_join_leave){return}if(this.volume_join_leave){ui.playUISound("user_leave",this.volume_join_leave)}this.addChatFiltered({id:data.user_id||data.client_id,display_name:data.display_name||data.client_id,flags:FLAG_EMOTE|FLAG_USERCHAT,msg:"left the channel",style:"join_leave"})}
ChatUI.prototype.registerOnMsgChatCB=function(cb){assert(!this.on_chat_cb)
this.on_chat_cb=cb}
ChatUI.prototype.onMsgChat=function(data){if(this.on_chat_cb){this.on_chat_cb(data)}var msg=data.msg,id=data.id,client_id=data.client_id,display_name=data.display_name,flags=data.flags,ts=data.ts,quiet=data.quiet
if(!quiet&&client_id!==netClientId()){if(this.volume_in){ui.playUISound("msg_in",this.volume_in)}}display_name=display_name||id
flags=(flags||0)|FLAG_USERCHAT
this.addChatFiltered({id:id,display_name:display_name,msg:msg,flags:flags,timestamp:ts,quiet:quiet})}
ChatUI.prototype.onChatBroadcast=function(data){var msg=data.msg,src=data.src
ui.playUISound("msg_err")
this.addChatFiltered({msg:"["+src+"] "+msg,style:"error"})}
ChatUI.prototype.runLate=function(){this.did_run_late=true
if(input.keyDownEdge(input.KEYS.RETURN)){this.edit_text_entry.focus()}if(input.keyDownEdge(input.KEYS.SLASH)||input.keyDownEdge(input.KEYS.NUMPAD_DIVIDE)){this.edit_text_entry.focus()
this.edit_text_entry.setText("/")}}
ChatUI.prototype.addChatError=function(err){this.addChat("[error] "+toStr(err),"error")}
ChatUI.prototype.handleCmdParseError=function(err,resp){if(err){this.addChatError(err)}}
ChatUI.prototype.handleCmdParse=function(err,resp){if(err){this.addChatError(err)}else if(resp){this.addChat("[system] "+toStr(resp),"system")}}
ChatUI.prototype.setGetRoles=function(fn){this.get_roles=fn}
var access_dummy={access:null}
ChatUI.prototype.getAccessObj=function(){access_dummy.access=this.get_roles()
return access_dummy}
ChatUI.prototype.cmdParse=function(str,cb){var _this=this
var handleResult=cb?function(err,resp){_this.handle_cmd_parse(err,resp)
if(cb){cb(err)}}:this.handle_cmd_parse
cmd_parse.handle(this.getAccessObj(),str,function(err,resp){if(err&&cmd_parse.was_not_found){netSubs().sendCmdParse(str,handleResult)}else{handleResult(err,resp)}})}
ChatUI.prototype.cmdParseInternal=function(str){cmd_parse.handle(this.getAccessObj(),str,this.handle_cmd_parse_error)}
function pad2(str){return("0"+str).slice(-2)}function conciseDate(dt){return pad2(dt.getMonth()+1)+"-"+pad2(dt.getDate())+" "+pad2(dt.getHours())+":"+pad2(dt.getMinutes())+":"+pad2(dt.getSeconds())}var help_font_style=glov_font.styleColored(null,255)
var help_font_style_cmd=glov_font.style(help_font_style,{outline_width:.5,outline_color:255})
var help_rollover_color=vec4(0,0,0,.25)
var help_rollover_color2=vec4(0,0,0,.125)
var TOOLTIP_MIN_PAGE_SIZE=20
var tooltip_page=0
var tooltip_last=""
var tooltip_panel_color=vec4()
function drawHelpTooltip(param){assert(Array.isArray(param.tooltip))
var tooltip=param.tooltip
var num_pages=1
var h=param.font_height
var eff_tooltip_pad=ui.tooltip_pad*.5
var num_per_page=min(TOOLTIP_MIN_PAGE_SIZE,max(1,floor((param.y-camera2d.y0()-eff_tooltip_pad)/h)-1))
if(tooltip.length>20){var text=tooltip.join("\n")
if(text!==tooltip_last){tooltip_page=0
tooltip_last=text}num_pages=ceil(tooltip.length/num_per_page)
tooltip=tooltip.slice(tooltip_page*num_per_page,(tooltip_page+1)*num_per_page)}else{tooltip_page=0
tooltip_last=""}var w=param.tooltip_width
var x=param.x
var z=param.z||Z.TOOLTIP+5
var text_x=x+eff_tooltip_pad
var text_w=w-eff_tooltip_pad*2
var tooltip_y1=param.y
var alpha=1
var vis_h=eff_tooltip_pad*2+h*tooltip.length
if(!param.do_selection&&num_pages===1&&input.mouseOver({x:x,y:tooltip_y1-vis_h,w:w,h:vis_h})){alpha=.15}var style=help_font_style
if(alpha!==1){style=glov_font.styleAlpha(style,alpha)}var y=tooltip_y1-eff_tooltip_pad
var ret=null
if(num_pages>1){y-=h
ui.font.drawSizedAligned(help_font_style,text_x,y,z+1,h,glov_font.ALIGN.HCENTER,text_w,0,"Page "+(tooltip_page+1)+" / "+num_pages)
var pos={x:x,y:y,w:w,h:h}
if(input.mouseUpEdge(pos)){tooltip_page=(tooltip_page+1)%num_pages}else if(input.mouseOver(pos)){ui.drawRect(x,y,x+w,y+h,z+.5,help_rollover_color)}}for(var ii=tooltip.length-1;ii>=0;--ii){var line=tooltip[ii]
y-=h
var idx=line.indexOf(" ")
if(line[0]==="/"&&idx!==-1&&param.do_selection){var cmd=line.slice(0,idx)
var help=line.slice(idx)
var cmd_w=ui.font.drawSized(help_font_style_cmd,text_x,y,z+1,h,cmd)
ui.font.drawSizedAligned(help_font_style,text_x+cmd_w,y,z+2,h,glov_font.ALIGN.HFIT,text_w-cmd_w,0,help)
var _pos={x:x,y:y,w:w,h:h}
if(input.mouseUpEdge(_pos)){ret=cmd.slice(1)}else if(input.mouseOver(_pos)){ui.drawRect(x,y,text_x+cmd_w+4,y+h,z+.5,help_rollover_color)
ui.drawRect(text_x+cmd_w+4,y,x+w,y+h,z+.5,help_rollover_color2)}}else{ui.font.drawSizedAligned(style,text_x,y,z+1,h,glov_font.ALIGN.HFIT,text_w,0,line)}}y-=eff_tooltip_pad
var pixel_scale=ui.tooltip_panel_pixel_scale*.5
v3copy(tooltip_panel_color,ui.color_panel)
tooltip_panel_color[3]=alpha
ui.panel({x:x,y:y,z:z,w:w,h:tooltip_y1-y,pixel_scale:pixel_scale,color:tooltip_panel_color})
return ret}ChatUI.prototype.isFocused=function(){return this.edit_text_entry&&this.edit_text_entry.isFocused()}
ChatUI.prototype.sendChat=function(flags,text){var _this2=this
if(!netClient().connected){this.addChatError("Cannot chat: Disconnected")}else if(!this.channel||!netSubs().loggedIn()&&!netSubs().allow_anon){this.addChatError("Cannot chat: Must be logged in")}else if(text.length>this.max_len){this.addChatError("Chat message too long")}else{var pak=this.channel.pak("chat")
pak.writeInt(flags)
pak.writeString(text)
pak.send(function(err,data){if(err){if(err==="ERR_ECHO"){_this2.onMsgChat({msg:text,id:netUserId(),client_id:netClientId(),display_name:netSubs().logged_in_display_name,flags:flags})}else{_this2.addChatError(err)
if(!_this2.edit_text_entry.getText()){_this2.edit_text_entry.setText(text)}}}})}}
ChatUI.prototype.run=function(opts){var _this3=this
var UI_SCALE=ui.font_height/24
opts=opts||{}
var border=opts.border||this.border||8*UI_SCALE
var SPACE_ABOVE_ENTRY=border
var scroll_grow=opts.scroll_grow||0
if(netClient().disconnected&&!this.hide_disconnected_message){ui.font.drawSizedAligned(glov_font.style(null,{outline_width:2,outline_color:255,color:3709870335}),camera2d.x0(),this.disconnected_message_top?engine.game_height*.8:camera2d.y0(),Z.DEBUG,ui.font_height,this.disconnected_message_top?glov_font.ALIGN.HCENTER:glov_font.ALIGN.HVCENTER,camera2d.w(),camera2d.h()*.2,"Connection lost, attempting to reconnect ("+(netClient().timeSinceDisconnect()/1e3).toFixed(0)+")...")}if(!this.did_run_late){this.runLate()}this.did_run_late=false
var x0=opts.x===undefined?camera2d.x0():opts.x
var y0=opts.y===undefined?camera2d.y1()-this.h:opts.y
var y1=y0+this.h
var x=x0+border
var y=y1
var outer_w=this.w
var was_focused=this.isFocused()
var z=was_focused?Z.CHAT_FOCUSED:Z.CHAT
var is_focused=false
var font_height=this.font_height
var anything_visible=false
var hide_light=(opts.hide||engine.defines.NOUI||!netSubs().loggedIn())&&!was_focused?1:0
var hide_text_input=ui.modal_dialog||ui.menu_up||hide_light
if(!hide_text_input&&was_focused&&input.touch_mode){outer_w=camera2d.x1()-x0-24*UI_SCALE
var font_scale=4
var aspect=camera2d.screenAspect()
if(aspect>2){font_scale=4+4*min((aspect-2)/8,1)}font_height*=font_scale}var inner_w=outer_w-border+this.inner_width_adjust
this.setActiveSize(font_height,inner_w)
if(!hide_text_input){anything_visible=true
y-=border+font_height+1
if(!was_focused&&opts.pointerlock&&input.pointerLocked()){ui.font.drawSizedAligned(this.styles.def,x,y,z+1,font_height,glov_font.ALIGN.HFIT,inner_w,0,"<Press Enter to chat>")}else{if(was_focused){var pressed_tab=!input.keyDown(input.KEYS.SHIFT)&&input.keyDownEdge(input.KEYS.TAB)
if(pressed_tab){this.edit_text_entry.focus()}var cur_text=this.edit_text_entry.getText()
if(cur_text){if(cur_text[0]==="/"){var autocomplete=cmd_parse.autoComplete(cur_text.slice(1),this.getAccessObj().access)
if(autocomplete&&autocomplete.length){var first=autocomplete[0]
var auto_text=[]
for(var ii=0;ii<autocomplete.length;++ii){var elem=autocomplete[ii]
auto_text.push("/"+elem.cmd+" - "+elem.help)}var do_selection=false
if(autocomplete.length===1&&first.cname&&cmd_parse.canonical(cur_text.slice(1)).slice(0,first.cname.length)===first.cname){if(first.usage){auto_text=first.usage.split("\n")}else{auto_text=[first.help]}}else{do_selection=true}var tooltip_y=y
var last_msg=this.msgs[this.msgs.length-1]
if(last_msg){var msg=last_msg.msg
if(msg&&!(last_msg.flags&FLAG_USERCHAT)&&msg.slice(0,7)==="[error]"){var numlines=last_msg.numlines
tooltip_y-=font_height*numlines+SPACE_ABOVE_ENTRY}}var selected=drawHelpTooltip({x:x,y:tooltip_y,tooltip_width:max(inner_w,engine.game_width*.8),tooltip:auto_text,do_selection:do_selection,font_height:min(font_height,camera2d.w()/30)})
if(do_selection){if(pressed_tab||selected){this.edit_text_entry.setText("/"+(selected||first.cmd)+" ")}}}}}else{this.history.resetPos()}if(input.keyDownEdge(input.KEYS.UP)){this.edit_text_entry.setText(this.history.prev(cur_text))}if(input.keyDownEdge(input.KEYS.DOWN)){this.edit_text_entry.setText(this.history.next(cur_text))}this.scroll_area.keyboardScroll()}var input_height=font_height
var input_width=inner_w-(opts.cuddly_scroll?this.scroll_area.barWidth()+1+border:border)
if(input.touch_mode&&!was_focused){y-=font_height*2
input_height=font_height*3
input_width=font_height*6}var res=this.edit_text_entry.run({x:x,y:y,w:input_width,font_height:input_height,pointer_lock:opts.pointerlock})
is_focused=this.isFocused()
if(res===this.edit_text_entry.SUBMIT){this.scroll_area.scrollToEnd()
var text=this.edit_text_entry.getText().trim()
if(text){var start_time=Date.now()
this.edit_text_entry.setText("")
if(text[0]==="/"){if(text[1]==="/"){text=text.slice(1)}this.history.add(text)
if(netSubs()){netSubs().serverLog("cmd",text)}this.cmdParse(text.slice(1),function(err){if(!err){return}if(_this3.volume_out){setTimeout(function(){return ui.playUISound("msg_out_err",_this3.volume_out)},max(0,_this3.msg_out_err_delay*1e3-(Date.now()-start_time)))}if(!_this3.edit_text_entry.getText()){_this3.edit_text_entry.setText(text)}if(!is_focused){_this3.edit_text_entry.focus()}})}else{this.sendChat(0,text)}if(this.volume_out){ui.playUISound("msg_out",this.volume_out)}if(settings.chat_auto_unfocus){is_focused=false
spotUnfocus()}}else{is_focused=false
spotUnfocus()}}}}y-=SPACE_ABOVE_ENTRY
var url_match=this.url_match,url_info=this.url_info,styles=this.styles,wrap_w=this.wrap_w,user_context_cb=this.user_context_cb
var self=this
var do_scroll_area=is_focused||opts.always_scroll
var bracket_width=0
var name_width={}
function drawChatLine(msg,alpha){if(msg.hidden){return}var line=msg.msg_text
var numlines=msg.numlines
var is_url=do_scroll_area&&url_match&&matchAll(line,url_match)
is_url=is_url&&is_url.length===1&&is_url[0]
var url_label=is_url
if(is_url&&url_info){var m=is_url.match(url_info)
if(m){url_label=m[1]}}var h=font_height*numlines
var do_mouseover=do_scroll_area&&!input.mousePosIsTouch()&&(!msg.style||msg.style==="def"||is_url)
var text_w
var mouseover=false
if(do_mouseover){text_w=ui.font.getStringWidth(styles.def,font_height,line)
mouseover=input.mouseOver({x:x,y:y,w:min(text_w,wrap_w),h:h,peek:true})}var user_mouseover=false
var user_indent=0
var did_user_context=false
if(msg.flags&FLAG_USERCHAT&&user_context_cb&&msg.id&&do_scroll_area){var nw=name_width[msg.display_name]
if(!nw){nw=name_width[msg.display_name]=ui.font.getStringWidth(styles.def,font_height,msg.display_name)}if(!(msg.flags&FLAG_EMOTE)){if(!bracket_width){bracket_width=ui.font.getStringWidth(styles.def,font_height,"[]")}nw+=bracket_width}user_indent=nw
var pos_param={x:x,y:y,w:min(nw,wrap_w),h:font_height,button:0,peek:true,z:z+.5,color:color_user_rollover}
if(input.click(pos_param)){did_user_context=true
user_context_cb({user_id:msg.id})}else{user_mouseover=input.mouseOver(pos_param)
if(user_mouseover){ui.drawRect2(pos_param)}}}var click
if(is_url){click=link({x:x+user_indent,y:y,w:wrap_w-user_indent,h:h,url:is_url,internal:true})}var style=styles[msg.style||(is_url?mouseover&&!user_mouseover?"link_hover":"link":"def")]
ui.font.drawSizedWrapped(glov_font.styleAlpha(style,alpha),x,y,z+1,wrap_w,self.indent,font_height,line)
if(mouseover&&(!do_scroll_area||y>self.scroll_area.getScrollPos()-font_height)&&(!msg.style||msg.style==="def"||is_url)){ui.drawTooltip({x:x,y:y,z:Z.TOOLTIP,tooltip_above:true,tooltip_width:450*UI_SCALE,tooltip_pad:round(ui.tooltip_pad*.5),tooltip:is_url&&!user_mouseover?"Click to open "+url_label:"Received"+(msg.id?' from "'+msg.id+'"':"")+" at "+conciseDate(new Date(msg.timestamp))+"\n"+"Right-click to copy message"+(""+(user_mouseover?"\nClick to view user info":"")),pixel_scale:ui.tooltip_panel_pixel_scale*.5})}click=click||input.click({x:x,y:y,w:wrap_w,h:h})
if(did_user_context){click=null}if(click){if(click.button===2){ui.provideUserString("Chat Text",is_url||line)}else if(is_url){self.cmdParseInternal("url "+url_label)}}anything_visible=true}var now=Date.now()
if(do_scroll_area){var scroll_internal_h=this.total_lines*font_height
if(opts.cuddly_scroll){var new_y=y1-border
scroll_internal_h+=new_y-y
y=new_y}scroll_internal_h+=scroll_grow
y+=scroll_grow
var scroll_y0=opts.always_scroll?y0+border-scroll_grow:y-min(this.h,scroll_internal_h)
var scroll_external_h=y-scroll_y0
var clip_offs=1
this.scroll_area.begin({x:x-clip_offs,y:scroll_y0,z:z,w:inner_w+clip_offs,h:scroll_external_h,focusable_elem:this.edit_text_entry,auto_hide:this.total_lines<=2})
var x_save=x
var y_save=y
x=clip_offs
y=0
var y_min=this.scroll_area.getScrollPos()
var y_max=y_min+scroll_external_h
for(var ii=0;ii<this.msgs.length;++ii){var msg=this.msgs[ii]
var h=font_height*msg.numlines
if(y<=y_max&&y+h>=y_min){drawChatLine(msg,1)}y+=h}this.scroll_area.end(scroll_internal_h)
x=x_save
y=y_save-scroll_external_h+scroll_grow
input.mouseDownEdge({x:x0,y:y-border,w:outer_w,h:y1-y+border})
if(input.mouseUpEdge({x:x0,y:y-border,w:outer_w,h:y1-y+border,in_event_cb:opts.pointerlock?input.pointerLockEnter:null})){spotUnfocus()
is_focused=false}input.mouseOver({x:x0,y:y-border,w:outer_w,h:y1-y+border})
if(input.mouseDownEdge({peek:true})){spotUnfocus()
is_focused=false}}else{var max_lines=this.max_lines
for(var _ii2=0;_ii2<this.msgs.length;++_ii2){var _msg=this.msgs[this.msgs.length-_ii2-1]
var age=now-_msg.timestamp
var alpha=1-clamp((age-this.fade_start_time[hide_light])/this.fade_time[hide_light],0,1)
if(!alpha||_msg.quiet){break}var numlines=_msg.numlines
if(numlines>max_lines&&_ii2){break}max_lines-=numlines
var _h=font_height*numlines
y-=_h
drawChatLine(_msg,alpha)}}if(opts.pointerlock&&is_focused&&input.pointerLocked()){input.pointerLockExit()}if(!anything_visible&&(ui.modal_dialog||ui.menu_up||hide_light)){return}ui.drawRect(x0,y-border,x0+outer_w,y1,z,[.3,.3,.3,.75])}
ChatUI.prototype.setChannel=function(channel){var _this4=this
if(channel===this.channel){return}if(this.channel){if(!channel){this.addChat("Left channel "+this.channel.channel_id)}this.channel.removeMsgHandler("chat",this.on_chat)
this.channel.removeMsgHandler("join",this.on_join)
this.channel.removeMsgHandler("leave",this.on_leave)}this.channel=channel
if(!this.channel){return}this.clearChat()
channel.onMsg("chat",this.on_chat)
channel.onMsg("join",this.on_join)
channel.onMsg("leave",this.on_leave)
var chat_history
var here=[]
var here_map={}
var friends=[]
asyncParallel([function(next){channel.send("chat_get",null,function(err,data){if(!err&&data&&data.msgs&&data.msgs.length){chat_history=data}next()})},function(next){channel.onceSubscribe(function(data){var clients=data&&data.public&&data.public.clients
if(clients){for(var client_id in clients){var client=clients[client_id]
var user_id=client.ids&&client.ids.user_id
var already_in_list=false
if(user_id&&client.ids.display_name){if(here_map[user_id]){already_in_list=true}else{here_map[user_id]=client.ids.display_name}}if(client_id===netClientId()||already_in_list){continue}if(client.ids){if(user_id&&isFriend(user_id)){friends.push(client.ids.display_name||user_id||client_id)}else{here.push(client.ids.display_name||user_id||client_id)}}}}next()})}],function(){if(!_this4.channel){return}if(chat_history){var messages_pre=_this4.msgs.slice(0)
if(messages_pre.length){_this4.msgs=[]}for(var ii=0;ii<chat_history.msgs.length;++ii){var idx=(chat_history.idx+ii)%chat_history.msgs.length
var elem=chat_history.msgs[idx]
if(elem&&elem.msg){elem.quiet=true
if(here_map[elem.id]){elem.display_name=here_map[elem.id]}_this4.onMsgChat(elem)}}if(messages_pre.length){_this4.msgs=_this4.msgs.concat(messages_pre)}}_this4.addChat("Joined channel "+_this4.channel.channel_id,"join_leave")
if(here.length||friends.length){var msg=[]
if(here.length){if(here.length>10){msg.push("Other users already here: "+here.slice(0,10).join(", ")+" (and "+(here.length-10)+" more...)")}else{msg.push("Other users already here: "+here.join(", "))}}if(friends.length){msg.push("Friends already here: "+friends.join(", "))}_this4.addChatFiltered({msg:msg.join("\n"),style:"join_leave"})}})}
function create(params){profanityStartup()
var chat_ui=new ChatUI(params)
function emote(str,resp_func){if(!str){return void resp_func(null,"Usage: /me does something.")}if(params.emote_cb){params.emote_cb(str)}chat_ui.sendChat(FLAG_EMOTE,str)}cmd_parse.registerValue("volume_chat_joinleave",{type:cmd_parse.TYPE_FLOAT,label:"Join/Leave chat message volume",range:[0,1],get:function get(){return chat_ui.volume_join_leave},set:function set(v){return chat_ui.volume_join_leave=v},store:true})
cmd_parse.registerValue("volume_chat_in",{type:cmd_parse.TYPE_FLOAT,label:"Incoming chat message volume",range:[0,1],get:function get(){return chat_ui.volume_in},set:function set(v){return chat_ui.volume_in=v},store:true})
cmd_parse.registerValue("volume_chat_out",{type:cmd_parse.TYPE_FLOAT,label:"Outgoing chat message volume",range:[0,1],get:function get(){return chat_ui.volume_out},set:function set(v){return chat_ui.volume_out=v},store:true})
cmd_parse.register({cmd:"me",help:"Emote",usage:"$HELP\n  Example: /me jumps up and down!",func:emote})
cmd_parse.register({access_show:["hidden"],cmd:"em",func:emote})
cmd_parse.register({cmd:"echo",help:"Echo text locally",func:function func(str,resp_func){chat_ui.addChatFiltered({msg:str})
resp_func()}})
return chat_ui}

},{"../common/util.js":89,"../common/vmath.js":91,"./camera2d.js":13,"./cmds.js":16,"./engine.js":20,"./font.js":26,"./input.js":36,"./link.js":37,"./local_storage.js":38,"./localization.js":39,"./net.js":43,"./scroll_area.js":53,"./settings.js":55,"./social.js":60,"./spot.js":63,"./ui.js":69,"./words/profanity.js":74,"assert":undefined,"glov-async":undefined}],15:[function(require,module,exports){
"use strict"
exports.PLATFORM_WEB=exports.PLATFORM_MOBILE=exports.PLATFORM_IOS=exports.PLATFORM_FBINSTANT=exports.PLATFORM_ANDROID=exports.PLATFORM=exports.MODE_PRODUCTION=exports.MODE_DEVELOPMENT=void 0
exports.getAbilityReload=getAbilityReload
exports.setAbilityReload=setAbilityReload
var assert=require("assert")
var _glovCommonEnums=require("../common/enums")
var Platform=_glovCommonEnums.Platform
var isValidPlatform=_glovCommonEnums.isValidPlatform
assert(isValidPlatform(window.conf_platform))
var PLATFORM=window.conf_platform
exports.PLATFORM=PLATFORM
var PLATFORM_WEB=PLATFORM===Platform.Web
exports.PLATFORM_WEB=PLATFORM_WEB
var PLATFORM_FBINSTANT=PLATFORM===Platform.FBInstant
exports.PLATFORM_FBINSTANT=PLATFORM_FBINSTANT
var PLATFORM_ANDROID=PLATFORM===Platform.Android
exports.PLATFORM_ANDROID=PLATFORM_ANDROID
var PLATFORM_IOS=PLATFORM===Platform.IOS
exports.PLATFORM_IOS=PLATFORM_IOS
var PLATFORM_MOBILE=PLATFORM_ANDROID||PLATFORM_IOS
exports.PLATFORM_MOBILE=PLATFORM_MOBILE
assert(PLATFORM_WEB||PLATFORM_FBINSTANT||PLATFORM_ANDROID||PLATFORM_IOS)
var MODE_DEVELOPMENT=(PLATFORM_WEB||PLATFORM_FBINSTANT)&&Boolean(String(document.location).match(/^https?:\/\/localhost/))
exports.MODE_DEVELOPMENT=MODE_DEVELOPMENT
var MODE_PRODUCTION=!MODE_DEVELOPMENT
exports.MODE_PRODUCTION=MODE_PRODUCTION
if(MODE_DEVELOPMENT){var _window$webkit,_window$webkit$messag
assert(PLATFORM_WEB||!window.FB)
assert(PLATFORM_FBINSTANT||!window.FBInstant)
assert(PLATFORM_ANDROID===Boolean(window.androidwrapper))
assert(PLATFORM_IOS===Boolean((_window$webkit=window.webkit)==null?void 0:(_window$webkit$messag=_window$webkit.messageHandlers)==null?void 0:_window$webkit$messag.iosWrapper))}var ability_reload=PLATFORM_WEB
function getAbilityReload(){return ability_reload}function setAbilityReload(value){ability_reload=PLATFORM_WEB&&value}

},{"../common/enums":82,"assert":undefined}],16:[function(require,module,exports){
"use strict"
exports.safearea=exports.cmd_parse=void 0
var cmd_parse_mod=require("../common/cmd_parse.js")
var local_storage=require("./local_storage.js")
var cmd_parse=cmd_parse_mod.create({storage:local_storage})
exports.cmd_parse=cmd_parse
var engine=require("./engine.js")
var _require=require("./error_report.js"),errorReportDetailsString=_require.errorReportDetailsString
var net=require("./net.js")
var netClient=net.netClient,netDisconnected=net.netDisconnected
var textures=require("./textures.js")
var _require2=require("../common/wscommon.js"),netDelayGet=_require2.netDelayGet,netDelaySet=_require2.netDelaySet
window.cmd=function(str){cmd_parse.handle(null,str,cmd_parse_mod.defaultHandler)}
function byteFormat(bytes){if(bytes>85e4){return(bytes/(1024*1024)).toFixed(2)+"MB"}if(bytes>850){return(bytes/1024).toFixed(2)+"KB"}return bytes+"B"}cmd_parse.register({cmd:"texmem",help:"Displays texture memory usage",func:function func(str,resp_func){var keys=Object.keys(textures.textures)
keys=keys.filter(function(a){return textures.textures[a].gpu_mem>1024})
keys.sort(function(a,b){return textures.textures[a].gpu_mem-textures.textures[b].gpu_mem})
resp_func(null,keys.map(function(a){return byteFormat(textures.textures[a].gpu_mem)+" "+a}).join("\n"))}})
cmd_parse.register({cmd:"gpumem",help:"Displays GPU memory usage summary",func:function func(str,resp_func){var gpu_mem=engine.perf_state.gpu_mem
resp_func(null,byteFormat(gpu_mem.geom)+" Geo\n"+byteFormat(gpu_mem.tex)+" Tex\n"+byteFormat(gpu_mem.geom+gpu_mem.tex)+" Total")}})
cmd_parse.register({cmd:"d",help:"Toggles a debug define",func:function func(str,resp_func){str=str.toUpperCase().trim()
if(!str){var any_changed=false
for(var key in engine.defines){engine.defines[key]=false
any_changed=true}if(any_changed){engine.definesChanged()
return void resp_func(null,"All debug defines cleared")}else{return void resp_func(null,"No debug defines active")}}engine.defines[str]=!engine.defines[str]
resp_func(null,"D="+str+" now "+(engine.defines[str]?"SET":"unset"))
engine.definesChanged()}})
cmd_parse.register({cmd:"renderer",help:"Displays current renderer",func:function func(str,resp_func){resp_func(null,"Renderer=WebGL"+(engine.webgl2?2:1))}})
cmd_parse.register({cmd:"csr",access_run:["sysadmin"],help:"(Admin) Run a command as another user",usage:"$HELP\n  /csr UserID command\n"+"Example: /csr jimbly gems -100",func:function func(str,resp_func){var idx=str.indexOf(" ")
if(idx===-1){return void resp_func("Invalid number of arguments")}var user_id=str.slice(0,idx)
var cmd=str.slice(idx+1)
var pak=net.subs.getChannelImmediate("user."+user_id).pak("csr_admin_to_user")
pak.writeJSON(cmd_parse.last_access)
pak.writeString(cmd)
pak.send(resp_func)}})
function cmdDesc(cmd_data){return"/"+cmd_data.cmd+" - "+cmd_data.help}cmd_parse.register({cmd:"help",help:"Searches commands",func:function func(str,resp_func){var list=cmd_parse.autoComplete("",this&&this.access)
if(str){var str_cname=cmd_parse.canonical(str)
var str_lc=str.toLowerCase()
list=list.filter(function(cmd_data){return cmd_data.cname.indexOf(str_cname)!==-1||cmd_data.help.toLowerCase().indexOf(str_lc)!==-1})}if(!list.length){return void resp_func(null,'No commands found matching "'+str+'"')}resp_func(null,list.map(cmdDesc).join("\n"))}})
var safearea=[-1,-1,-1,-1]
exports.safearea=safearea
cmd_parse.registerValue("safe_area",{label:"Safe Area",type:cmd_parse.TYPE_STRING,usage:"Safe Area value: Use -1 for auto based on browser environment,\n"+"or 0-25 for percentage of screen size\n"+"  Usage: /safe_area [value]\n"+"  Usage: /safe_area horizontal,vertical\n"+"  Usage: /safe_area left,right,top,bottom",default_value:"-1",get:function get(){return safearea[0]===-1?"-1 (auto)":safearea.join(",")},set:function set(v){v=String(v)
var keys=v.split(",")
if(v&&keys.length===1){safearea[0]=safearea[1]=safearea[2]=safearea[3]=Number(v)}else if(keys.length===2){safearea[0]=safearea[1]=Number(keys[0])
safearea[2]=safearea[3]=Number(keys[1])}else if(keys.length===4){for(var ii=0;ii<4;++ii){safearea[ii]=Number(keys[ii])}}else{}for(var _ii=0;_ii<4;++_ii){if(!isFinite(safearea[_ii])){safearea[_ii]=-1}}},store:true})
cmd_parse.register({cmd:"webgl2_auto",help:"Resets WebGL2 auto-detection",func:function func(str,resp_func){var disable_data=local_storage.getJSON("webgl2_disable")
if(!disable_data){return resp_func(null,"WebGL2 is already being auto-detected")}local_storage.setJSON("webgl2_disable",undefined)
return resp_func(null,"WebGL2 was disabled, will attempt to use it again on the next load")}})
cmd_parse.registerValue("postprocessing",{label:"Postprocessing",type:cmd_parse.TYPE_INT,help:"Enables/disables postprocessing",get:function get(){return engine.postprocessing?1:0},set:function set(v){return engine.postprocessingAllow(v)}})
cmd_parse.register({cmd:"net_delay",help:"Sets/shows network delay values",usage:"$HELP\n/net_delay time_base time_rand",func:function func(str,resp_func){if(str){var params=str.split(" ")
netDelaySet(Number(params[0]),Number(params[1])||0)}var cur=netDelayGet()
resp_func(null,"Client NetDelay: "+cur[0]+"+"+cur[1])}})
cmd_parse.register({cmd:"error_report_details",help:"Shows details submitted with any error report",access_show:["hidden"],func:function func(str,resp_func){resp_func(null,errorReportDetailsString())}})
cmd_parse.register({cmd:"disconnect",help:"Forcibly disconnect WebSocket connection (Note: will auto-reconnect)",func:function func(str,resp_func){var _netClient
var socket=(_netClient=netClient())==null?void 0:_netClient.socket
if(!socket){return void resp_func("No socket")}if(netDisconnected()){return void resp_func("Not connected")}socket.close()
resp_func()}})

},{"../common/cmd_parse.js":79,"../common/wscommon.js":93,"./engine.js":20,"./error_report.js":22,"./local_storage.js":38,"./net.js":43,"./textures.js":67}],17:[function(require,module,exports){
"use strict"
exports.colorPicker=colorPicker
var camera2d=require("./camera2d.js")
var _require=require("./hsv.js"),hsvToRGB=_require.hsvToRGB,rgbToHSV=_require.rgbToHSV
var input=require("./input.js")
var min=Math.min
var ui=require("./ui.js")
var LINE_CAP_SQUARE=ui.LINE_CAP_SQUARE
var _require2=require("./sprites.js"),clipped=_require2.clipped,clipPause=_require2.clipPause,clipResume=_require2.clipResume,createSprite=_require2.createSprite
var textures=require("./textures.js")
var _require3=require("../common/util.js"),clamp=_require3.clamp
var _require4=require("../common/vmath.js"),vec3=_require4.vec3,v3copy=_require4.v3copy,vec4=_require4.vec4
var color_black=vec4(0,0,0,1)
function colorPickerOpen(state){state.open=true
if(!state.color_hs){state.color_hs=vec4(0,0,0,1)
state.color_v=vec4(0,0,0,1)
state.hsv=vec3()}rgbToHSV(state.hsv,state.rgba)}function colorPickerAlloc(param){var state={open:false,rgba:vec4(0,0,0,1)}
v3copy(state.rgba,param.color)
return state}var picker_sprite_hue_sat
var picker_sprite_val
function initTextures(){var HS_SIZE=32
var data=new Uint8Array(HS_SIZE*HS_SIZE*3)
var rgb=vec3()
var idx=0
for(var j=0;j<HS_SIZE;j++){var sat=1-j/(HS_SIZE-1)
for(var i=0;i<HS_SIZE;i++){var hue=i*360/(HS_SIZE-1)
hsvToRGB(rgb,hue,sat,1)
data[idx++]=rgb[0]*255
data[idx++]=rgb[1]*255
data[idx++]=rgb[2]*255}}picker_sprite_hue_sat=createSprite({url:"cpicker_hs",width:HS_SIZE,height:HS_SIZE,format:textures.format.RGB8,data:data,filter_min:gl.LINEAR,filter_mag:gl.LINEAR,wrap_s:gl.CLAMP_TO_EDGE,wrap_t:gl.CLAMP_TO_EDGE})
data=new Uint8Array(32)
for(var ii=0;ii<data.length;++ii){data[ii]=255-ii*255/(data.length-1)}picker_sprite_val=createSprite({url:"cpicker_v",width:1,height:data.length,format:textures.format.R8,data:data,filter_min:gl.LINEAR,filter_mag:gl.LINEAR,wrap_s:gl.CLAMP_TO_EDGE,wrap_t:gl.CLAMP_TO_EDGE})}function colorPicker(param){var state=ui.getUIElemData("colorpicker",param,colorPickerAlloc)
var icon_h=param.icon_h||ui.button_height
var icon_w=param.icon_w||icon_h
var picker_h=param.picker_h||ui.button_height*4
var pad=param.pad||3
var x=param.x,y=param.y,z=param.z
if(!state.open){v3copy(state.rgba,param.color)}if(ui.buttonImage({x:x,y:y,z:z,w:icon_w,h:icon_h,img:ui.sprites.white,color:state.rgba})){if(!state.open){colorPickerOpen(state)}else{state.open=false}}var handled=ui.button_mouseover
if(state.open){var clip_pause=clipped()
if(clip_pause){clipPause()}if(!picker_sprite_hue_sat){initTextures()}y=min(y,camera2d.y1()-picker_h)
z+=2
x+=icon_w+pad
var x0=x
var y0=y
var hsv=state.hsv
var hue_sat_w=picker_h
var val_w=picker_h*.1
hsvToRGB(state.color_v,0,0,hsv[2])
var hue_sat_param={x:x,y:y,z:z,w:hue_sat_w,h:picker_h,color:state.color_v,max_dist:Infinity}
picker_sprite_hue_sat.draw(hue_sat_param)
var drag=input.drag(hue_sat_param)||input.click(hue_sat_param)
if(drag){handled=true
var pos=drag.cur_pos||drag.pos
hsv[0]=clamp((pos[0]-x)/hue_sat_param.w*360,0,360)
hsv[1]=clamp(1-(pos[1]-y)/hue_sat_param.h,0,1)}var hs_x=x+hsv[0]*hue_sat_w/360
var hs_y=y+(1-hsv[1])*picker_h
ui.drawLine(hs_x-pad,hs_y,hs_x+pad,hs_y,z+1,1,1,color_black,LINE_CAP_SQUARE)
ui.drawLine(hs_x,hs_y-pad,hs_x,hs_y+pad,z+1,1,1,color_black,LINE_CAP_SQUARE)
x+=hue_sat_w+pad
hsvToRGB(state.color_hs,hsv[0],hsv[1],1)
var val_param={x:x,y:y,z:z,w:val_w,h:picker_h,color:state.color_hs,max_dist:Infinity}
picker_sprite_val.draw(val_param)
drag=input.drag(val_param)||input.click(val_param)
if(drag){handled=true
var _pos=drag.cur_pos||drag.pos
hsv[2]=clamp(1-(_pos[1]-y)/val_param.h,0,1)}var v_y=y+(1-hsv[2])*picker_h
ui.drawLine(x,v_y,x+val_w,v_y,z+1,1,1,color_black,LINE_CAP_SQUARE)
x+=val_w
hsvToRGB(state.rgba,state.hsv[0],state.hsv[1],state.hsv[2])
var panel_param={x:x0-pad,y:y0-pad,w:x-x0+pad*2,h:picker_h+pad*2,z:z-1}
if(input.mouseOver(panel_param)){handled=true}input.drag(panel_param)
ui.panel(panel_param)
if(clip_pause){clipResume()}if(input.click({peek:true})||!handled&&input.mouseDownAnywhere()){state.open=false}}v3copy(param.color,state.rgba)}

},{"../common/util.js":89,"../common/vmath.js":91,"./camera2d.js":13,"./hsv.js":34,"./input.js":36,"./sprites.js":65,"./textures.js":67,"./ui.js":69}],18:[function(require,module,exports){
"use strict"
exports.editBoxCreate=editBoxCreate
exports.editBoxTick=editBoxTick
exports.create=editBoxCreate
var assert=require("assert")
var camera2d=require("./camera2d.js")
var engine=require("./engine.js")
var _require=require("./input.js"),KEYS=_require.KEYS,eatAllKeyboardInput=_require.eatAllKeyboardInput,mouseConsumeClicks=_require.mouseConsumeClicks,keyUpEdge=_require.keyUpEdge,pointerLockEnter=_require.pointerLockEnter,pointerLockExit=_require.pointerLockExit,pointerLocked=_require.pointerLocked,inputClick=_require.inputClick
var _require2=require("./spot.js"),SPOT_NAV_LEFT=_require2.SPOT_NAV_LEFT,SPOT_NAV_RIGHT=_require2.SPOT_NAV_RIGHT,spotFocusCheck=_require2.spotFocusCheck,spotFocusSteal=_require2.spotFocusSteal,spotUnfocus=_require2.spotUnfocus,spotlog=_require2.spotlog
var glov_ui=require("./ui.js")
var _require3=require("./ui.js"),uiGetDOMElem=_require3.uiGetDOMElem
var form_hook_registered=false
var active_edit_box
var active_edit_box_frame
var this_frame_edit_boxes=[]
var last_frame_edit_boxes=[]
function editBoxTick(){var expected_last_frame=engine.frame_index-1
for(var ii=0;ii<last_frame_edit_boxes.length;++ii){var edit_box=last_frame_edit_boxes[ii]
if(edit_box.last_frame<expected_last_frame){edit_box.unrun()}}last_frame_edit_boxes=this_frame_edit_boxes
this_frame_edit_boxes=[]}function setActive(edit_box){active_edit_box=edit_box
active_edit_box_frame=engine.frame_index}function formHook(ev){ev.preventDefault()
if(!active_edit_box||active_edit_box_frame<engine.frame_index-1){return}active_edit_box.submitted=true
active_edit_box.updateText()
if(active_edit_box.pointer_lock&&!active_edit_box.text){pointerLockEnter("edit_box_submit")}}var last_key_id=0
var GlovUIEditBox=function(){function GlovUIEditBox(params){var _this$custom_nav
this.key="eb"+ ++last_key_id
this.x=0
this.y=0
this.z=Z.UI
this.w=glov_ui.button_width
this.type="text"
this.font_height=glov_ui.font_height
this.text=""
this.placeholder=""
this.max_len=0
this.zindex=null
this.uppercase=false
this.initial_focus=false
this.onetime_focus=false
this.auto_unfocus=false
this.initial_select=false
this.spellcheck=true
this.esc_clears=true
this.multiline=0
this.autocomplete=false
this.custom_nav=(_this$custom_nav={},_this$custom_nav[SPOT_NAV_LEFT]=null,_this$custom_nav[SPOT_NAV_RIGHT]=null,_this$custom_nav)
this.sticky_focus=true
this.applyParams(params)
assert.equal(typeof this.text,"string")
this.last_autocomplete=null
this.is_focused=false
this.elem=null
this.input=null
this.submitted=false
this.pointer_lock=false
this.last_frame=0
this.out={}}var _proto=GlovUIEditBox.prototype
_proto.applyParams=function applyParams(params){if(!params){return}for(var f in params){this[f]=params[f]}if(this.text===undefined){this.text=""}this.h=this.font_height}
_proto.updateText=function updateText(){this.text=this.input.value
if(this.max_len>0){this.text=this.text.slice(0,this.max_len)}}
_proto.getText=function getText(){return this.text}
_proto.setText=function setText(new_text){new_text=String(new_text)
if(this.input){this.input.value=new_text}this.text=new_text}
_proto.focus=function focus(){if(this.input){this.input.focus()
setActive(this)}else{this.onetime_focus=true}spotFocusSteal(this)
this.is_focused=true
if(this.pointer_lock&&pointerLocked()){pointerLockExit()}}
_proto.unfocus=function unfocus(){spotUnfocus()}
_proto.isFocused=function isFocused(){return this.is_focused}
_proto.updateFocus=function updateFocus(){var was_glov_focused=this.is_focused
var spot_ret=spotFocusCheck(this)
var focused=spot_ret.focused
var dom_focused=this.input&&document.activeElement===this.input
if(was_glov_focused!==focused){if(focused&&!dom_focused&&this.input){spotlog("GLOV focused, DOM not, focusing",this)
this.input.focus()}if(!focused&&dom_focused){spotlog("DOM focused, GLOV not, and changed, blurring",this)
this.input.blur()}}else if(dom_focused&&!focused){spotlog("DOM focused, GLOV not, stealing",this)
spotFocusSteal(this)
focused=true}else if(!dom_focused&&focused){}if(focused){setActive(this)
var key_opt=this.pointer_lock&&!this.text?{in_event_cb:pointerLockEnter}:null
if(keyUpEdge(KEYS.ESC,key_opt)){if(this.text&&this.esc_clears){this.setText("")}else{spotUnfocus()
if(this.input){this.input.blur()}focused=false
this.canceled=true}}}this.is_focused=focused
return spot_ret}
_proto.run=function run(params){this.applyParams(params)
if(this.last_frame!==engine.frame_index-1){this.submitted=false}this.last_frame=engine.frame_index
this.canceled=false
var _this$updateFocus=this.updateFocus(),allow_focus=_this$updateFocus.allow_focus,focused=_this$updateFocus.focused
this_frame_edit_boxes.push(this)
var elem=allow_focus&&uiGetDOMElem(this.elem,true)
if(elem!==this.elem){if(elem){if(!form_hook_registered){form_hook_registered=true
var form=document.getElementById("dynform")
if(form){form.addEventListener("submit",formHook,true)}}elem.textContent=""
var input=document.createElement(this.multiline?"textarea":"input")
input.setAttribute("type",this.type)
input.setAttribute("placeholder",this.placeholder)
if(this.max_len){input.setAttribute("maxLength",this.max_len)}if(this.multiline){input.setAttribute("rows",this.multiline)}input.setAttribute("tabindex",2)
elem.appendChild(input)
var span=document.createElement("span")
span.setAttribute("tabindex",3)
elem.appendChild(span)
input.value=this.text
if(this.uppercase){input.style["text-transform"]="uppercase"}this.input=input
if(this.initial_focus||this.onetime_focus){input.focus()
setActive(this)
this.onetime_focus=false}if(this.initial_select){input.select()}}else{this.input=null}this.submitted=false
this.elem=elem}else{if(this.input){this.updateText()}}if(elem){var pos=camera2d.htmlPos(this.x,this.y)
if(!this.spellcheck){elem.spellcheck=false}elem.style.left=pos[0]+"%"
elem.style.top=pos[1]+"%"
var size=camera2d.htmlSize(this.w,0)
elem.style.width=size[0]+"%"
var old_fontsize=elem.style.fontSize||"?px"
var new_fontsize=camera2d.virtualToFontSize(this.font_height).toFixed(0)+"px"
if(new_fontsize!==old_fontsize){elem.style.fontSize=new_fontsize}if(this.zindex){elem.style["z-index"]=this.zindex}if(this.last_autocomplete!==this.autocomplete){this.last_autocomplete=this.autocomplete
this.input.setAttribute("autocomplete",this.autocomplete||"auto_off_"+Math.random())}}if(focused){if(this.auto_unfocus){if(inputClick({peek:true})){spotUnfocus()}}eatAllKeyboardInput()}mouseConsumeClicks({x:this.x,y:this.y,w:this.w,h:this.h})
if(this.submitted){this.submitted=false
return this.SUBMIT}if(this.canceled){this.canceled=false
return this.CANCEL}return null}
_proto.unrun=function unrun(){this.elem=null
this.input=null}
return GlovUIEditBox}()
GlovUIEditBox.prototype.SUBMIT="submit"
GlovUIEditBox.prototype.CANCEL="cancel"
function editBoxCreate(params){return new GlovUIEditBox(params)}

},{"./camera2d.js":13,"./engine.js":20,"./input.js":36,"./spot.js":63,"./ui.js":69,"assert":undefined}],19:[function(require,module,exports){
"use strict"
exports.additiveMatrix=additiveMatrix
exports.applyColorMatrix=applyColorMatrix
exports.applyCopy=applyCopy
exports.applyGaussianBlur=applyGaussianBlur
exports.applyPixelyExpand=applyPixelyExpand
exports.brightnessAddMatrix=brightnessAddMatrix
exports.brightnessScaleMatrix=brightnessScaleMatrix
exports.clearAlpha=clearAlpha
exports.contrastMatrix=contrastMatrix
exports.effectsIsFinal=effectsIsFinal
exports.effectsPassAdd=effectsPassAdd
exports.effectsPassConsume=effectsPassConsume
exports.effectsQueue=effectsQueue
exports.effectsReset=effectsReset
exports.effectsStartup=effectsStartup
exports.effectsTopOfFrame=effectsTopOfFrame
exports.grayScaleMatrix=grayScaleMatrix
exports.hueMatrix=hueMatrix
exports.negativeMatrix=negativeMatrix
exports.registerShader=registerShader
exports.saturationMatrix=saturationMatrix
exports.sepiaMatrix=sepiaMatrix
var assert=require("assert")
var engine=require("./engine.js")
var renderWidth=engine.renderWidth,renderHeight=engine.renderHeight
var _require=require("./framebuffer.js"),framebufferEnd=_require.framebufferEnd,framebufferStart=_require.framebufferStart,framebufferTopOfFrame=_require.framebufferTopOfFrame
var geom=require("./geom.js")
var shaders=require("./shaders.js")
var sprites=require("./sprites.js")
var textures=require("./textures.js")
var _require2=require("../common/vmath.js"),vec2=_require2.vec2,vec3=_require2.vec3,vec4=_require2.vec4,v4set=_require2.v4set
var shader_data={vp_copy:{vp:"shaders/effects_copy.vp"},copy:{fp:"shaders/effects_copy.fp"},pixely_expand:{fp:"shaders/pixely_expand.fp"},gaussian_blur:{fp:"shaders/effects_gaussian_blur.fp"},color_matrix:{fp:"shaders/effects_color_matrix.fp"}}
function registerShader(key,obj){shader_data[key]=obj}function getShader(key){var elem=shader_data[key]
if(!elem.shader){if(elem.fp){elem.shader=shaders.create(elem.fp)}else{elem.shader=shaders.create(elem.vp)}}return elem.shader}var inited=false
var clip_space=vec4(2,2,-1,-1)
var copy_uv_scale=vec2(1,1)
var shader_params_default={clip_space:clip_space,copy_uv_scale:copy_uv_scale}
var shader_params_color_matrix
var shader_params_gaussian_blur
var shader_params_pixely_expand
var quad_geom
function startup(){inited=true
quad_geom=geom.create([[shaders.semantic.POSITION,gl.FLOAT,2,false]],new Float32Array([0,0,1,0,1,1,0,1]),null,geom.QUADS)
shader_params_color_matrix={clip_space:clip_space,copy_uv_scale:copy_uv_scale,colorMatrix:new Float32Array([0,0,0,0,0,0,0,0,0,0,0,0])}
shader_params_gaussian_blur={clip_space:clip_space,copy_uv_scale:copy_uv_scale,sampleRadius:vec3(1,1,1),Gauss:new Float32Array([.93,.8,.7,.6,.5,.4,.3,.2,.1])}
shader_params_pixely_expand={clip_space:clip_space,copy_uv_scale:copy_uv_scale,orig_pixel_size:vec4()}}var num_passes=0
function effectsPassAdd(){++num_passes}function effectsPassConsume(){assert(num_passes);--num_passes}function doEffect(fn){effectsPassConsume()
fn()}function effectsQueue(z,fn){effectsPassAdd()
sprites.queuefn(z,doEffect.bind(null,fn))}function effectsTopOfFrame(){num_passes=0
framebufferTopOfFrame()}function effectsReset(){assert.equal(num_passes,0)}function effectsIsFinal(){return!num_passes}function grayScaleMatrix(dst){dst[0]=.2126
dst[1]=.2126
dst[2]=.2126
dst[3]=.7152
dst[4]=.7152
dst[5]=.7152
dst[6]=.0722
dst[7]=.0722
dst[8]=.0722
dst[9]=dst[10]=dst[11]=0}function sepiaMatrix(dst){dst[0]=.393
dst[1]=.349
dst[2]=.272
dst[3]=.769
dst[4]=.686
dst[5]=.534
dst[6]=.189
dst[7]=.168
dst[8]=.131
dst[9]=dst[10]=dst[11]=0}function negativeMatrix(dst){dst[0]=dst[4]=dst[8]=-1
dst[1]=dst[2]=dst[3]=dst[5]=dst[6]=dst[7]=0
dst[9]=dst[10]=dst[11]=1}function saturationMatrix(dst,saturationScale){var is=1-saturationScale
dst[0]=is*.2126+saturationScale
dst[1]=is*.2126
dst[2]=is*.2126
dst[3]=is*.7152
dst[4]=is*.7152+saturationScale
dst[5]=is*.7152
dst[6]=is*.0722
dst[7]=is*.0722
dst[8]=is*.0722+saturationScale
dst[9]=dst[10]=dst[11]=0}function hueMatrix(dst,angle){var c=Math.cos(angle)
var s=Math.sin(angle)
dst[0]=.7874*c+-.3712362230889293*s+.2126
dst[1]=-.2126*c+.20611404610069642*s+.2126
dst[2]=-.2126*c+-.9485864922785551*s+.2126
dst[3]=-.7152*c+-.4962902913954023*s+.7152
dst[4]=.2848*c+.08105997779422341*s+.7152
dst[5]=-.7152*c+.6584102469838492*s+.7152
dst[6]=-.0722*c+.8675265144843316*s+.0722
dst[7]=-.0722*c+-.28717402389491986*s+.0722
dst[8]=.9278*c+.290176245294706*s+.0722
dst[9]=dst[10]=dst[11]=0}function brightnessAddMatrix(dst,brightnessOffset){dst[0]=dst[4]=dst[8]=1
dst[1]=dst[2]=dst[3]=dst[5]=dst[6]=dst[7]=0
dst[9]=dst[10]=dst[11]=brightnessOffset}function brightnessScaleMatrix(dst,scale){dst[0]=dst[4]=dst[8]=scale
dst[1]=dst[2]=dst[3]=dst[5]=dst[6]=dst[7]=0
dst[9]=dst[10]=dst[11]=0}function additiveMatrix(dst,additiveRGB){dst[0]=dst[4]=dst[8]=1
dst[1]=dst[2]=dst[3]=dst[5]=dst[6]=dst[7]=0
dst[9]=additiveRGB[0]
dst[10]=additiveRGB[1]
dst[11]=additiveRGB[2]}function contrastMatrix(dst,contrastScale){dst[0]=dst[4]=dst[8]=contrastScale
dst[1]=dst[2]=dst[3]=dst[5]=dst[6]=dst[7]=0
dst[9]=dst[10]=dst[11]=.5*(1-contrastScale)}function applyEffect(effect,view_w,view_h){var final=effect.final!==false&&effectsIsFinal()||effect.final
if(effect.no_framebuffer){var viewport=engine.viewport
var target_w=viewport[2]
var target_h=viewport[3]
view_w=view_w||target_w
view_h=view_h||target_h
clip_space[0]=2*view_w/target_w
clip_space[1]=2*view_h/target_h}else if(effect.viewport){var _viewport=effect.viewport
var _target_w=_viewport[2]
var _target_h=_viewport[3]
view_w=view_w||_target_w
view_h=view_h||_target_h
clip_space[0]=2*view_w/_target_w
clip_space[1]=2*view_h/_target_h
framebufferStart({clear:effect.clear,clear_all:effect.clear_all,clear_color:effect.clear_color,viewport:_viewport,final:final})}else{clip_space[0]=2
clip_space[1]=2
view_w=view_w||renderWidth()
view_h=view_h||renderHeight()
framebufferStart({width:view_w,height:view_h,final:final})}shaders.bind(getShader("vp_copy"),getShader(effect.shader),effect.params)
textures.bindArray(effect.texs)
quad_geom.draw()}function applyCopy(params){if(!inited){startup()}var source=params.source
if(!source){source=framebufferEnd({filter_linear:params.filter_linear,need_depth:params.need_depth})}params.shader=params.shader||"copy"
params.params=shader_params_default
if(Array.isArray(source)){params.texs=source}else{params.texs=[source]}applyEffect(params)}function applyPixelyExpand(params){if(!inited){startup()}var source=params.source
assert(!source)
if(!source){source=framebufferEnd({filter_linear:true})}var resx=source.width
var resy=source.height
var sampleRadius=(params.hblur||.25)/resx
shader_params_gaussian_blur.sampleRadius[0]=sampleRadius
shader_params_gaussian_blur.sampleRadius[1]=0
shader_params_gaussian_blur.sampleRadius[2]=1
applyEffect({shader:"gaussian_blur",params:shader_params_gaussian_blur,texs:[source],final:false},resx,resy)
var hblur=framebufferEnd({filter_linear:true})
sampleRadius=(params.vblur||.75)/resy
shader_params_gaussian_blur.sampleRadius[0]=0
shader_params_gaussian_blur.sampleRadius[1]=sampleRadius
shader_params_gaussian_blur.sampleRadius[2]=1
applyEffect({shader:"gaussian_blur",params:shader_params_gaussian_blur,texs:[hblur],final:false},resx,resy)
var vblur=framebufferEnd({filter_linear:true})
v4set(shader_params_pixely_expand.orig_pixel_size,source.width,source.height,1/source.width,1/source.height)
applyEffect({shader:"pixely_expand",params:shader_params_pixely_expand,texs:[source,hblur,vblur],clear:params.clear,clear_all:params.clear_all,clear_color:params.clear_color,viewport:params.viewport})}function applyGaussianBlur(params){if(!inited){startup()}var source=framebufferEnd({filter_linear:true})
var max_size=params.max_size||512
var min_size=params.min_size||128
var inputTexture0=source
var viewport=engine.viewport
var res=max_size
while(res>viewport[2]||res>viewport[3]){res/=2}while(res>min_size){applyEffect({shader:params.shader_copy||"copy",params:shader_params_default,texs:[inputTexture0],final:false},res,res)
inputTexture0=framebufferEnd({filter_linear:true})
res/=2}var sampleRadius=(params.blur||1)/res
shader_params_gaussian_blur.sampleRadius[0]=sampleRadius
shader_params_gaussian_blur.sampleRadius[1]=0
shader_params_gaussian_blur.sampleRadius[2]=params.glow||1
applyEffect({shader:"gaussian_blur",params:shader_params_gaussian_blur,texs:[inputTexture0],final:false},res,res)
var blur=framebufferEnd({filter_linear:true})
shader_params_gaussian_blur.sampleRadius[0]=0
shader_params_gaussian_blur.sampleRadius[1]=sampleRadius
shader_params_gaussian_blur.sampleRadius[2]=params.glow||1
applyEffect({shader:"gaussian_blur",params:shader_params_gaussian_blur,texs:[blur]})
return true}function applyColorMatrix(params){if(!inited){startup()}var source=framebufferEnd({filter_linear:true})
var matrix=params.colorMatrix
var mout=shader_params_color_matrix.colorMatrix
mout[0]=matrix[0]
mout[1]=matrix[3]
mout[2]=matrix[6]
mout[3]=matrix[9]
mout[4]=matrix[1]
mout[5]=matrix[4]
mout[6]=matrix[7]
mout[7]=matrix[10]
mout[8]=matrix[2]
mout[9]=matrix[5]
mout[10]=matrix[8]
mout[11]=matrix[11]
applyEffect({shader:"color_matrix",params:shader_params_color_matrix,texs:[source]})
return true}function clearAlpha(){var old_dt=gl.getParameter(gl.DEPTH_TEST)
if(old_dt){gl.disable(gl.DEPTH_TEST)}gl.colorMask(false,false,false,true)
applyCopy({source:textures.textures.white,no_framebuffer:true})
gl.colorMask(true,true,true,true)
if(old_dt){gl.enable(gl.DEPTH_TEST)}}function effectsStartup(prelink_effects){prelink_effects.forEach(function(name){shaders.prelink(getShader("vp_copy"),getShader(name))})}

},{"../common/vmath.js":91,"./engine.js":20,"./framebuffer.js":27,"./geom.js":28,"./shaders.js":57,"./sprites.js":65,"./textures.js":67,"assert":undefined}],20:[function(require,module,exports){
"use strict"
exports.ZNEAR=exports.ZFAR=exports.PERF_HISTORY_SIZE=exports.DEBUG=void 0
exports.addTickFunc=addTickFunc
exports.addViewSpaceGlobal=addViewSpaceGlobal
exports.canvas=exports.border_color=exports.border_clear_color=exports.app_state=exports.antialias_unavailable=exports.antialias=void 0
exports.clearHad3DThisFrame=clearHad3DThisFrame
exports.defineCausesReload=defineCausesReload
exports.defines=void 0
exports.definesChanged=definesChanged
exports.disableRender=disableRender
exports.dom_to_canvas_ratio=void 0
exports.engineStartupFunc=engineStartupFunc
exports.fixNatives=fixNatives
exports.game_width=exports.game_height=exports.frame_timestamp=exports.frame_index=exports.frame_dt=exports.fov_y=exports.fov_x=exports.font=void 0
exports.getFrameDt=getFrameDt
exports.getFrameDtActual=getFrameDtActual
exports.getFrameIndex=getFrameIndex
exports.getFrameTimestamp=getFrameTimestamp
exports.getViewportPostprocess=getViewportPostprocess
exports.glCheckError=glCheckError
exports.light_dir_ws=exports.light_diffuse=exports.light_ambient=exports.is_loading=exports.hrtime=exports.hrnow=exports.height=exports.had_3d_this_frame=exports.glov_particles=void 0
exports.loadsPending=loadsPending
exports.pixel_aspect=exports.perf_state=exports.mat_vp=exports.mat_view=exports.mat_projection=void 0
exports.postRender=postRender
exports.postTick=postTick
exports.postprocessing=void 0
exports.postprocessingAllow=postprocessingAllow
exports.preSpriteRender=preSpriteRender
exports.projectionZBias=projectionZBias
exports.releaseCanvas=releaseCanvas
exports.reloadSafe=reloadSafe
exports.removeTickFunc=removeTickFunc
exports.renderHeight=renderHeight
exports.renderWidth=renderWidth
exports.render_width=exports.render_height=void 0
exports.resizing=resizing
exports.setFOV=setFOV
exports.setFonts=setFonts
exports.setGameDims=setGameDims
exports.setGlobalMatrices=setGlobalMatrices
exports.setMatVP=setMatVP
exports.setPixelyStrict=setPixelyStrict
exports.setState=setState
exports.setViewport=setViewport
exports.setViewportPostprocess=setViewportPostprocess
exports.setZRange=setZRange
exports.setupProjection=setupProjection
exports.start3DRendering=start3DRendering
exports.startSpriteRendering=startSpriteRendering
exports.startup=startup
exports.stateActive=stateActive
exports.updateMatrices=updateMatrices
exports.width=exports.webgl2=exports.viewport=void 0
require("./bootstrap.js")
var client_config=require("./client_config.js")
var DEBUG=client_config.MODE_DEVELOPMENT
exports.DEBUG=DEBUG
var startup_funcs=[]
exports.require=require
require("not_worker")
var assert=require("assert")
var _require=require("./browser.js"),is_ios_safari=_require.is_ios_safari
var _require2=require("./build_ui.js"),buildUIStartup=_require2.buildUIStartup
var camera2d=require("./camera2d.js")
var cmds=require("./cmds.js")
var effects=require("./effects.js")
var effectsReset=effects.effectsReset,effectsTopOfFrame=effects.effectsTopOfFrame,effectsIsFinal=effects.effectsIsFinal,effectsPassAdd=effects.effectsPassAdd,effectsPassConsume=effects.effectsPassConsume
var _require3=require("./error_report.js"),errorReportDisable=_require3.errorReportDisable,errorReportSetTimeAccum=_require3.errorReportSetTimeAccum,errorReportSetDetails=_require3.errorReportSetDetails,glovErrorReport=_require3.glovErrorReport
var glov_font=require("./font.js")
var fontTick=glov_font.fontTick
var _require4=require("./framebuffer.js"),framebufferStart=_require4.framebufferStart,framebufferEndOfFrame=_require4.framebufferEndOfFrame
var geom=require("./geom.js")
var input=require("./input.js")
var local_storage=require("./local_storage.js")
var mat3FromMat4=require("gl-mat3/fromMat4")
var mat4Copy=require("gl-mat4/copy")
var mat4Invert=require("gl-mat4/invert")
var mat4Mul=require("gl-mat4/multiply")
var mat4Transpose=require("gl-mat4/transpose")
var mat4Perspective=require("gl-mat4/perspective")
var asin=Math.asin,cos=Math.cos,floor=Math.floor,min=Math.min,max=Math.max,PI=Math.PI,round=Math.round,sin=Math.sin,sqrt=Math.sqrt
var models=require("./models.js")
var perf=require("./perf.js")
var _require5=require("./profiler.js"),profilerFrameStart=_require5.profilerFrameStart,profilerGarbageEstimate=_require5.profilerGarbageEstimate
var _require6=require("./profiler_ui.js"),profilerUIStartup=_require6.profilerUIStartup
var _require7=require("../common/perfcounters.js"),perfCounterTick=_require7.perfCounterTick
var settings=require("./settings.js")
var shaders=require("./shaders.js")
var _require8=require("./shader_debug_ui.js"),shaderDebugUIStartup=_require8.shaderDebugUIStartup
var _require9=require("./sound.js"),soundLoading=_require9.soundLoading,soundStartup=_require9.soundStartup,soundTick=_require9.soundTick
var _require10=require("./spot.js"),spotEndInput=_require10.spotEndInput
var sprites=require("./sprites.js")
var blendModeReset=sprites.blendModeReset
var textures=require("./textures.js")
var texturesTick=textures.texturesTick
var glov_transition=require("./transition.js")
var glov_ui=require("./ui.js")
var urlhash=require("./urlhash.js")
var _require11=require("../common/util.js"),callEach=_require11.callEach,clamp=_require11.clamp,defaults=_require11.defaults,nearSame=_require11.nearSame,ridx=_require11.ridx
var _require12=require("../common/vmath.js"),mat3=_require12.mat3,mat4=_require12.mat4,vec3=_require12.vec3,vec4=_require12.vec4,v3mulMat4=_require12.v3mulMat4,v3iNormalize=_require12.v3iNormalize,v4copy=_require12.v4copy,v4same=_require12.v4same,v4set=_require12.v4set
var canvas
exports.canvas=canvas
var webgl2
exports.webgl2=webgl2
var glov_particles
exports.glov_particles=glov_particles
var width
exports.width=width
var height
exports.height=height
var width_3d
var height_3d
var pixel_aspect=1
exports.pixel_aspect=pixel_aspect
var dom_to_canvas_ratio=window.devicePixelRatio||1
exports.dom_to_canvas_ratio=dom_to_canvas_ratio
var antialias
exports.antialias=antialias
var antialias_unavailable
exports.antialias_unavailable=antialias_unavailable
var game_width
exports.game_width=game_width
var game_height
exports.game_height=game_height
var game_aspect
var render_width
exports.render_width=render_width
var render_height
exports.render_height=render_height
var defines=urlhash.register({key:"D",type:urlhash.TYPE_SET,change:definesChanged})
exports.defines=defines
var ZFAR
exports.ZFAR=ZFAR
var ZNEAR
exports.ZNEAR=ZNEAR
var fov_y=1
exports.fov_y=fov_y
var fov_x=1
exports.fov_x=fov_x
var mat_projection=mat4()
exports.mat_projection=mat_projection
var mat_view=mat4()
exports.mat_view=mat_view
var mat_m=mat4()
var mat_vp=mat4()
exports.mat_vp=mat_vp
var mat_mv=mat4()
var mat_mv_no_skew=mat4()
var mat_mvp=mat4()
var mat_mv_inv_transform=mat3()
var mat_inv_view=mat3()
var light_diffuse=vec3(.75,.75,.75)
exports.light_diffuse=light_diffuse
var light_ambient=vec3(.25,.25,.25)
exports.light_ambient=light_ambient
var light_dir_ws=vec3(-1,-2,-3)
exports.light_dir_ws=light_dir_ws
var font
exports.font=font
var app_state=null
exports.app_state=app_state
var border_color=vec4(0,0,0,1)
exports.border_color=border_color
var border_clear_color=vec4(0,0,0,1)
exports.border_clear_color=border_clear_color
var no_render=false
function disableRender(new_value){no_render=new_value
if(no_render){glov_ui.cleanupDOMElems()}}var view_space_globals=[]
function addViewSpaceGlobal(name){var ws_name=name+"_ws"
var ws_vec=shaders.globals[ws_name]
assert(ws_vec)
assert.equal(ws_vec.length,3)
var vs_name=name+"_vs"
var vs_vec=vec3()
shaders.addGlobal(vs_name,vs_vec)
view_space_globals.push({vs:vs_vec,ws:ws_vec})}var mat_temp=mat4()
function setGlobalMatrices(_mat_view){mat4Copy(mat_view,_mat_view)
mat4Mul(mat_vp,mat_projection,mat_view)
v3iNormalize(light_dir_ws)
for(var ii=0;ii<view_space_globals.length;++ii){var vsg=view_space_globals[ii]
v3mulMat4(vsg.vs,vsg.ws,mat_view)}mat4Invert(mat_temp,mat_view)
mat3FromMat4(mat_inv_view,mat_temp)}function setMatVP(_mat_view){setupProjection(fov_y,width_3d,height_3d,ZNEAR,ZFAR)
mat4Copy(mat_view,_mat_view)
mat4Mul(mat_vp,mat_projection,mat_view)}function setFOV(fov_min){var w=width_3d
var h=height_3d
var aspect=w/h
if(aspect>game_aspect){exports.fov_y=fov_y=fov_min
var rise=sin(fov_y/2)/cos(fov_y/2)*aspect
exports.fov_x=fov_x=2*asin(rise/sqrt(rise*rise+1))}else{var _rise=sin(fov_min/2)/cos(fov_min/2)*game_aspect
exports.fov_x=fov_x=2*asin(_rise/sqrt(_rise*_rise+1))
var rise2=sin(fov_x/2)/cos(fov_x/2)/aspect
exports.fov_y=fov_y=2*asin(rise2/sqrt(rise2*rise2+1))}}function setGameDims(w,h){exports.game_width=game_width=w
exports.game_height=game_height=h
game_aspect=game_width/game_height}var postprocessing_reset_version="5"
var postprocessing=local_storage.get("glov_no_postprocessing")!==postprocessing_reset_version
exports.postprocessing=postprocessing
function postprocessingAllow(allow){local_storage.set("glov_no_postprocessing",allow?undefined:postprocessing_reset_version)
exports.postprocessing=postprocessing=allow}function glCheckError(){var gl_err=gl.getError()
if(gl_err){console.error(gl_err)
throw new Error(gl_err)}}function releaseCanvas(){try{if(gl){var ext=gl.getExtension("WEBGL_lose_context")
if(ext){ext.loseContext()}}}catch(ignored){}}function reloadSafe(){errorReportDisable()
releaseCanvas()
if(window.FBInstant){try{window.top.location.reload()}catch(e){window.FBInstant.quit()}}else{document.location.reload()}}window.reloadSafe=reloadSafe
var reloading_defines={}
function defineCausesReload(define){reloading_defines[define]=defines[define]}defineCausesReload("FORCEWEBGL2")
defineCausesReload("NOWEBGL2")
function definesChanged(){for(var key in reloading_defines){if(defines[key]!==reloading_defines[key]){urlhash.onURLChange(reloadSafe)
break}}shaders.handleDefinesChanged()}function normalizeRow(m,idx){var len=m[idx]*m[idx]+m[idx+1]*m[idx+1]+m[idx+2]*m[idx+2]
if(len>0){len=1/sqrt(len)
m[idx]*=len
m[idx+1]*=len
m[idx+2]*=len}}function updateMatrices(mat_model){mat4Copy(mat_m,mat_model)
mat4Mul(mat_mv,mat_view,mat_model)
mat4Mul(mat_mvp,mat_projection,mat_mv)
mat4Copy(mat_temp,mat_model)
normalizeRow(mat_temp,0)
normalizeRow(mat_temp,4)
normalizeRow(mat_temp,8)
mat4Mul(mat_mv_no_skew,mat_view,mat_temp)
mat4Invert(mat_temp,mat_mv_no_skew)
mat4Transpose(mat_temp,mat_temp)
mat3FromMat4(mat_mv_inv_transform,mat_temp)}var frame_timestamp=0
exports.frame_timestamp=frame_timestamp
function getFrameTimestamp(){return frame_timestamp}var frame_index=0
exports.frame_index=frame_index
function getFrameIndex(){return frame_index}var frame_dt=0
exports.frame_dt=frame_dt
function getFrameDt(){return frame_dt}var hrtime=0
exports.hrtime=hrtime
var this_frame_time_actual=0
function getFrameDtActual(){return this_frame_time_actual}var after_loading_state=null
var is_loading=true
exports.is_loading=is_loading
function setState(new_state){if(is_loading){after_loading_state=new_state}else{exports.app_state=app_state=new_state}}function stateActive(test_state){if(is_loading){return after_loading_state===test_state}else{return app_state===test_state}}var mspf=1e3
var mspf_update_time=0
var mspf_frame_count=0
var last_tick_cpu=0
var mspf_tick=1e3
var mspf_tick_accum=0
var garbage_estimate=0
var PERF_HISTORY_SIZE=128
exports.PERF_HISTORY_SIZE=PERF_HISTORY_SIZE
var perf_state=window.glov_perf_state={fpsgraph:{index:0,history:new Float32Array(PERF_HISTORY_SIZE*2)},gpu_mem:{tex:0,geom:0}}
exports.perf_state=perf_state
var fpsgraph=perf_state.fpsgraph
perf.addMetric({name:"fps",show_stat:"show_fps",show_graph:"fps_graph",labels:{"fps: ":function fps(){return(1e3/mspf).toFixed(1)},"ms/f: ":function msF(){return mspf.toFixed(0)},"cpu: ":function cpu(){return mspf_tick.toFixed(0)},"gc/f: ":function gcF(){return garbage_estimate?garbage_estimate.toFixed(1):""}},data:fpsgraph,line_scale_top:50,colors:[vec4(1,.925,.153,1),vec4(0,.894,.212,1)]},true)
var do_borders=true
var do_viewport_postprocess=false
var need_repos=0
function resizing(){return need_repos}var app_tick_functions=[]
function addTickFunc(cb){app_tick_functions.push(cb)}function removeTickFunc(cb){var idx=app_tick_functions.indexOf(cb)
if(idx!==-1){app_tick_functions.splice(idx,1)
return true}return false}var post_tick=[]
function postTick(opts){opts.ticks=opts.ticks||1
opts.inactive=opts.inactive||false
assert.equal(typeof opts.fn,"function")
post_tick.push(opts)}var pre_sprite_render=null
function preSpriteRender(fn){if(!pre_sprite_render){pre_sprite_render=[]}pre_sprite_render.push(fn)}var post_render=null
function postRender(fn){if(!post_render){post_render=[]}post_render.push(fn)}function resetEffects(){effectsReset()
framebufferEndOfFrame()}function renderWidth(){return render_width||width}function renderHeight(){return render_height||height}var SAFARI_FULLSCREEN_ASPECT=function(){var screen=window.screen
if(!is_ios_safari||!screen){return 0}var SAFARI_DIMS={"896,414":896/414,"812,375":812/375,"736,414":736/414,"716,414":736/414,"667,375":667/375,"647,375":667/375,"548,320":568/320}
var key=max(screen.availWidth,screen.availHeight)+","+min(screen.availWidth,screen.availHeight)
return SAFARI_DIMS[key]||0}()
function safariTopSafeArea(view_w,view_h){if(SAFARI_FULLSCREEN_ASPECT&&nearSame(view_w/view_h,SAFARI_FULLSCREEN_ASPECT,.001)){return 50*(window.devicePixelRatio||1)}return 0}var last_canvas_width
var last_canvas_height
var last_body_height
var safearea_elem
var safearea_ignore_bottom=false
var safearea_values=[0,0,0,0]
var last_safearea_values=[0,0,0,0]
function checkResize(){profilerStart("checkResize")
var vv=window.visualViewport||{}
exports.dom_to_canvas_ratio=dom_to_canvas_ratio=window.devicePixelRatio||1
exports.dom_to_canvas_ratio=dom_to_canvas_ratio=dom_to_canvas_ratio*settings.render_scale_all
var view_w=vv.width||window.innerWidth
var view_h=vv.height||window.innerHeight
if(view_h!==last_body_height){last_body_height=view_h
if(document.body){document.body.style.height=view_h+"px"}}var rect=canvas.getBoundingClientRect()
var new_width=round(rect.width*dom_to_canvas_ratio)||1
var new_height=round(rect.height*dom_to_canvas_ratio)||1
if(cmds.safearea[0]===-1){if(safearea_elem){var sa_width=safearea_elem.offsetWidth
var sa_height=safearea_elem.offsetHeight
if(sa_width&&sa_height){v4set(safearea_values,safearea_elem.offsetLeft*dom_to_canvas_ratio,new_width-(sa_width+safearea_elem.offsetLeft)*dom_to_canvas_ratio,max(safearea_elem.offsetTop*dom_to_canvas_ratio,safariTopSafeArea(view_w,view_h)*settings.render_scale_all),safearea_ignore_bottom?0:new_height-(sa_height+safearea_elem.offsetTop)*dom_to_canvas_ratio)}}}else{v4set(safearea_values,new_width*clamp(cmds.safearea[0],0,25)/100,new_width*clamp(cmds.safearea[1],0,25)/100,new_height*clamp(cmds.safearea[2],0,25)/100,new_height*clamp(cmds.safearea[3],0,25)/100)}if(!v4same(safearea_values,last_safearea_values)){v4copy(last_safearea_values,safearea_values)
camera2d.setSafeAreaPadding(safearea_values[0],safearea_values[1],safearea_values[2],safearea_values[3])
need_repos=max(need_repos,1)}if(new_width!==last_canvas_width||new_height!==last_canvas_height){window.pixel_scale=dom_to_canvas_ratio
last_canvas_width=canvas.width=new_width||1
last_canvas_height=canvas.height=new_height||1
exports.width=width=canvas.width
exports.height=height=canvas.height
need_repos=10}if(is_ios_safari&&(window.visualViewport||need_repos)){window.scroll(0,0)}profilerStop("checkResize")}var viewport=vec4(0,0,1,1)
exports.viewport=viewport
function setViewport(xywh){v4copy(viewport,xywh)
gl.viewport(xywh[0],xywh[1],xywh[2],xywh[3])}var frames_requested=0
function requestFrame(user_time){var max_fps=settings.max_fps
var desired_frames=max_fps>=250?10:1
if(frames_requested>=desired_frames){return}if(defines.SLOWLOAD&&is_loading){max_fps=2}if(desired_frames>1){while(frames_requested<desired_frames){setTimeout(tick,1)
frames_requested++}}else if(max_fps){var desired_delay=max(0,round(1e3/max_fps-(user_time||0)))
frames_requested++
setTimeout(tick,desired_delay)}else{frames_requested++
requestAnimationFrame(tick)}}var mat_projection_10
var had_3d_this_frame
exports.had_3d_this_frame=had_3d_this_frame
function clearHad3DThisFrame(){exports.had_3d_this_frame=had_3d_this_frame=false}function setupProjection(use_fov_y,use_width,use_height,znear,zfar){mat4Perspective(mat_projection,use_fov_y,use_width/use_height,znear,zfar)
mat_projection_10=mat_projection[10]}function setZRange(znear,zfar){exports.ZNEAR=ZNEAR=znear
exports.ZFAR=ZFAR=zfar
if(had_3d_this_frame){setupProjection(fov_y,width_3d,height_3d,ZNEAR,ZFAR)}}function set3DRenderResolution(w,h){width_3d=w
height_3d=h}var want_render_scale_3d_this_frame
var had_render_scale_3d_this_frame
function start3DRendering(opts){opts=opts||{}
if(opts.width){set3DRenderResolution(opts.width,opts.height)}setFOV(opts.fov||settings.fov*PI/180)
exports.had_3d_this_frame=had_3d_this_frame=true
if(!opts.width&&want_render_scale_3d_this_frame&&!defines.NOCOPY){had_render_scale_3d_this_frame=true
effectsPassAdd()}blendModeReset(true)
gl.enable(gl.BLEND)
gl.enable(gl.DEPTH_TEST)
gl.depthMask(true)
var backbuffer_width=width_3d
var backbuffer_height=height_3d
if(opts.viewport){backbuffer_width=render_width||width
backbuffer_height=render_height||height}framebufferStart({width:backbuffer_width,height:backbuffer_height,final:effectsIsFinal(),need_depth:opts.need_depth||true,clear:true,clear_all:opts.clear_all===undefined?settings.render_scale_clear:opts.clear_all,viewport:opts.viewport})
setupProjection(fov_y,width_3d,height_3d,ZNEAR,ZFAR)
gl.enable(gl.CULL_FACE)}function renderScaleFinish(){if(defines.NOCOPY){gl.disable(gl.SCISSOR_TEST)
v4set(viewport,0,0,width,height)
gl.viewport(viewport[0],viewport[1],viewport[2],viewport[3])}else{effectsPassConsume()
if(settings.render_scale_mode===2){effects.applyPixelyExpand({final:effectsIsFinal(),clear:false})}else{effects.applyCopy({filter_linear:settings.render_scale_mode===0})}}}function startSpriteRendering(){gl.disable(gl.CULL_FACE)
blendModeReset(true)
gl.enable(gl.BLEND)
gl.disable(gl.DEPTH_TEST)
gl.depthMask(false)}function projectionZBias(dist,at_z){if(!dist){mat_projection[10]=mat_projection_10
return}var e=.2*(dist/(at_z*(at_z+dist)))
e=max(e,2e-7)
mat_projection[10]=mat_projection_10+e}function fixNatives(is_startup){var b=[]
for(var a in b){console[is_startup?"log":"error"]('Found invasive enumerable property "'+a+'" on Array.prototype, removing...')
var old_val=b[a]
errorReportSetDetails("had_native_"+a,typeof old_val)
delete Array.prototype[a]
Object.defineProperty(Array.prototype,a,{value:old_val,enumerable:false})}for(var _a in b){assert(false,"Array.prototype has unremovable member "+_a)}}function resetState(){profilerStart("resetState")
profilerStart("textures")
textures.texturesResetState()
profilerStopStart("shaders")
shaders.shadersResetState()
profilerStopStart("geom;gl")
geom.geomResetState()
blendModeReset(true)
gl.enable(gl.BLEND)
gl.enable(gl.DEPTH_TEST)
gl.depthMask(true)
gl.enable(gl.CULL_FACE)
gl.depthFunc(gl.LEQUAL)
gl.disable(gl.SCISSOR_TEST)
gl.cullFace(gl.BACK)
gl.viewport(0,0,width,height)
profilerStop()
profilerStop("resetState")}var hrnow=window.performance?window.performance.now.bind(window.performance):Date.now.bind(Date)
exports.hrnow=hrnow
var last_tick=0
function tick(timestamp){profilerFrameStart()
profilerStart("tick")
profilerStart("top")
frames_requested--
exports.hrtime=hrtime=hrnow()
var now=round(hrtime)
if(!last_tick){last_tick=now}this_frame_time_actual=now-last_tick
var dt=min(max(this_frame_time_actual,1),250)
exports.frame_dt=frame_dt=dt
last_tick=now
exports.frame_timestamp=frame_timestamp=frame_timestamp+dt
exports.frame_index=++frame_index
errorReportSetTimeAccum(frame_timestamp)
fixNatives(false)
fpsgraph.history[fpsgraph.index%PERF_HISTORY_SIZE*2+1]=this_frame_time_actual
fpsgraph.index++
fpsgraph.history[fpsgraph.index%PERF_HISTORY_SIZE*2+0]=0;++mspf_frame_count
mspf_tick_accum+=last_tick_cpu
if(now-mspf_update_time>settings.fps_window*1e3){if(!mspf_update_time){mspf_update_time=now}else{mspf=(now-mspf_update_time)/mspf_frame_count
mspf_tick=mspf_tick_accum/mspf_frame_count
mspf_tick_accum=0
garbage_estimate=profilerGarbageEstimate()/1024
mspf_frame_count=0
mspf_update_time=now}}perfCounterTick(dt)
effectsTopOfFrame()
if(document.hidden||document.webkitHidden||no_render){resetEffects()
input.tickInputInactive()
last_tick_cpu=0
for(var ii=post_tick.length-1;ii>=0;--ii){if(post_tick[ii].inactive&&!--post_tick[ii].ticks){post_tick[ii].fn()
ridx(post_tick,ii)}}requestFrame()
profilerStop()
return profilerStop("tick")}checkResize()
exports.had_3d_this_frame=had_3d_this_frame=false
want_render_scale_3d_this_frame=false
had_render_scale_3d_this_frame=false
if(render_width){set3DRenderResolution(render_width,render_height)
effectsPassAdd()}else{width_3d=max(1,round(width*settings.render_scale))
height_3d=max(1,round(height*settings.render_scale))
if(width_3d!==width){want_render_scale_3d_this_frame=true}}resetState()
textures.bind(0,textures.textures.error)
fontTick()
camera2d.tickCamera2D()
glov_transition.render(dt)
camera2d.setAspectFixed(game_width,game_height)
profilerStopStart("mid")
soundTick(dt)
input.tickInput()
glov_ui.tickUI(dt)
if(need_repos){--need_repos
var ul=[]
camera2d.virtualToDom(ul,[0,0])
var lr=[]
camera2d.virtualToDom(lr,[game_width-1,game_height-1])
var viewport2=[ul[0],ul[1],lr[0],lr[1]]
var view_height=viewport2[3]-viewport2[1]
var font_size=min(256,max(2,floor(view_height/800*16)))
var elem_fullscreen=document.getElementById("fullscreen")
if(elem_fullscreen){elem_fullscreen.style["font-size"]=font_size+"px"}}if(do_borders){glov_ui.drawRect(camera2d.x0Real(),camera2d.y0Real(),camera2d.x1Real(),0,Z.BORDERS,border_color)
glov_ui.drawRect(camera2d.x0Real(),game_height,camera2d.x1Real(),camera2d.y1Real(),Z.BORDERS,border_color)
glov_ui.drawRect(camera2d.x0Real(),0,0,game_height,Z.BORDERS,border_color)
glov_ui.drawRect(game_width,0,camera2d.x1Real(),game_height,Z.BORDERS,border_color)}perf.draw()
profilerStopStart("app_state")
for(var _ii=0;_ii<app_tick_functions.length;++_ii){app_tick_functions[_ii](dt)}if(app_state){app_state(dt)}profilerStopStart("bottom")
spotEndInput()
glov_particles.tick(dt)
if(had_3d_this_frame){if(had_render_scale_3d_this_frame){renderScaleFinish()}}else{if(render_width){framebufferStart({width:render_width,height:render_height,clear:true,clear_all:settings.render_scale_clear,final:effectsIsFinal(),need_depth:false})}else{framebufferStart({width:width,height:height,clear:true,final:effectsIsFinal(),need_depth:false})}}if(pre_sprite_render){callEach(pre_sprite_render,pre_sprite_render=null)}startSpriteRendering()
sprites.draw()
glov_ui.endFrame()
if(post_render){callEach(post_render,post_render=null)}if(render_width){effectsPassConsume()
var final_viewport=[camera2d.render_offset_x,camera2d.render_offset_y_bottom,camera2d.render_viewport_w,camera2d.render_viewport_h]
var params={clear:true,clear_all:true,clear_color:border_clear_color,viewport:final_viewport}
if(do_viewport_postprocess){effects.applyPixelyExpand(params)}else{effects.applyCopy(params)}}input.endFrame()
resetEffects()
texturesTick()
for(var _ii2=post_tick.length-1;_ii2>=0;--_ii2){if(!--post_tick[_ii2].ticks){post_tick[_ii2].fn()
ridx(post_tick,_ii2)}}last_tick_cpu=hrnow()-now
fpsgraph.history[fpsgraph.index%PERF_HISTORY_SIZE*2+0]=last_tick_cpu
requestFrame(hrnow()-hrtime)
profilerStop("bottom")
return profilerStop("tick")}function periodiclyRequestFrame(){requestFrame()
setTimeout(periodiclyRequestFrame,5e3)}function setPixelyStrict(on){if(on){exports.render_width=render_width=game_width
exports.render_height=render_height=game_height}else{exports.render_width=render_width=undefined
exports.render_height=render_height=undefined}}function getViewportPostprocess(){return do_viewport_postprocess}function setViewportPostprocess(viewport_postprocess){do_viewport_postprocess=viewport_postprocess}function setFonts(new_font,title_font){exports.font=font=new_font
glov_ui.setFonts(new_font,title_font)}function engineStartupFunc(func){startup_funcs.push(func)}function startup(params){fixNatives(true)
exports.canvas=canvas=document.getElementById("canvas")
safearea_elem=document.getElementById("safearea")
if(params.error_report!==false){window.glov_error_report=function(msg,file,line,col){setTimeout(requestFrame,1)
return glovErrorReport(true,msg,file,line,col)}}if(DEBUG&&!window.spector){Object.defineProperty(Number.prototype,"length",{get:function get(){assert(false,"Numbers do not have a length property")
return undefined}})}safearea_ignore_bottom=params.safearea_ignore_bottom||false
window.addEventListener("resize",checkResize,false)
checkResize()
var is_pixely=params.pixely&&params.pixely!=="off"
exports.antialias=antialias=params.antialias||!is_pixely&&params.antialias!==false
var powerPreference=params.high?"high-performance":"default"
var context_names=["webgl2","webgl","experimental-webgl"]
var force_webgl1=defines.NOWEBGL2
var disable_data=local_storage.getJSON("webgl2_disable")
if(disable_data&&disable_data.ua===navigator.userAgent&&disable_data.ts>Date.now()-7*24*60*60*1e3){console.log("Disabling WebGL2 because a previous run encountered a related error")
force_webgl1=true}if(DEBUG&&!defines.FORCEWEBGL2){var rc=local_storage.getJSON("run_count",0)+1
local_storage.setJSON("run_count",rc)
if(rc%2){force_webgl1=true}}if(force_webgl1){context_names.splice(0,1)}var context_opts=[{antialias:antialias,powerPreference:powerPreference,alpha:false},{powerPreference:powerPreference,alpha:false},{antialias:antialias,alpha:false},{alpha:false},{}]
var good=false
exports.webgl2=webgl2=false
for(var i=0;!good&&i<context_names.length;i+=1){for(var jj=0;!good&&jj<context_opts.length;++jj){try{window.gl=canvas.getContext(context_names[i],context_opts[jj])
if(window.gl){if(context_names[i]==="webgl2"){exports.webgl2=webgl2=true}if(antialias&&!context_opts[jj].antialias){exports.antialias_unavailable=antialias_unavailable=true
exports.antialias=antialias=false}good=true
break}}catch(e){}}}if(!window.requestAnimationFrame){good=false}if(!good){window.alert("Sorry, but your browser does not support WebGL or does not have it enabled.")
document.getElementById("loading").style.visibility="hidden"
document.getElementById("nowebgl").style.visibility="visible"
return false}console.log("Using WebGL"+(webgl2?2:1))
assert(gl)
canvas.focus()
setGameDims(params.game_width||1280,params.game_height||960)
exports.ZNEAR=ZNEAR=params.znear||.7
exports.ZFAR=ZFAR=params.zfar||1e4
setPixelyStrict(params.pixely==="strict")
if(params.viewport_postprocess){do_viewport_postprocess=true}exports.pixel_aspect=pixel_aspect=params.pixel_aspect||1
gl.depthFunc(gl.LEQUAL)
gl.cullFace(gl.BACK)
gl.clearColor(0,.1,.2,1)
gl.pixelStorei(gl.UNPACK_ALIGNMENT,1)
textures.startup()
geom.startup()
shaders.startup({light_diffuse:light_diffuse,light_dir_ws:light_dir_ws,ambient:light_ambient,mat_m:mat_m,mat_mv:mat_mv,mat_vp:mat_vp,mvp:mat_mvp,mv_inv_trans:mat_mv_inv_transform,mat_inv_view:mat_inv_view,view:mat_view,projection:mat_projection})
addViewSpaceGlobal("light_dir")
camera2d.startup()
sprites.startup()
input.startup(canvas,params)
models.startup()
exports.glov_particles=glov_particles=require("./particles.js").create()
if(is_pixely){textures.defaultFilters(gl.NEAREST,gl.NEAREST)
settings.runTimeDefault("render_scale_mode",1)
params.ui_sprites=defaults(params.ui_sprites||{},glov_ui.ui_sprites_pixely)}else{textures.defaultFilters(gl.LINEAR_MIPMAP_LINEAR,gl.LINEAR)}assert(params.font)
params.font=exports.font=font=glov_font.create(params.font.info,params.font.texture)
if(params.title_font){params.title_font=glov_font.create(params.title_font.info,params.title_font.texture)}glov_ui.startup(params)
soundStartup(params.sound)
glov_ui.bindSounds(defaults(params.ui_sounds||{},{button_click:"button_click",rollover:"rollover"}))
buildUIStartup()
shaderDebugUIStartup()
profilerUIStartup()
callEach(startup_funcs,startup_funcs=null)
camera2d.setAspectFixed(game_width,game_height)
if(params.state){setState(params.state)}if(params.do_borders!==undefined){do_borders=params.do_borders}if(params.show_fps!==undefined){settings.show_fps=params.show_fps}periodiclyRequestFrame()
return true}function loadsPending(){return textures.load_count+soundLoading()+models.load_count}function loading(){var load_count=loadsPending()
var elem_loading_text=document.getElementById("loading_text")
if(elem_loading_text){elem_loading_text.innerText="Loading ("+load_count+")..."}if(!load_count){exports.is_loading=is_loading=false
exports.app_state=app_state=after_loading_state
postTick({ticks:2,fn:function fn(){var loading_elem=document.getElementById("loading")
if(loading_elem){loading_elem.style.visibility="hidden"}}})}}exports.app_state=app_state=loading
window.glov_engine=exports

},{"../common/perfcounters.js":86,"../common/util.js":89,"../common/vmath.js":91,"./bootstrap.js":10,"./browser.js":11,"./build_ui.js":12,"./camera2d.js":13,"./client_config.js":15,"./cmds.js":16,"./effects.js":19,"./error_report.js":22,"./font.js":26,"./framebuffer.js":27,"./geom.js":28,"./input.js":36,"./local_storage.js":38,"./models.js":42,"./particles.js":45,"./perf.js":46,"./profiler.js":49,"./profiler_ui.js":50,"./settings.js":55,"./shader_debug_ui.js":56,"./shaders.js":57,"./sound.js":61,"./spot.js":63,"./sprites.js":65,"./textures.js":67,"./transition.js":68,"./ui.js":69,"./urlhash.js":71,"assert":undefined,"gl-mat3/fromMat4":undefined,"gl-mat4/copy":undefined,"gl-mat4/invert":undefined,"gl-mat4/multiply":undefined,"gl-mat4/perspective":undefined,"gl-mat4/transpose":undefined,"not_worker":undefined}],21:[function(require,module,exports){
"use strict"
exports.environmentsInit=environmentsInit
exports.getAPIPath=getAPIPath
exports.getCurrentEnvironment=getCurrentEnvironment
exports.getExternalTextureURL=getExternalTextureURL
exports.getLinkBase=getLinkBase
exports.setCurrentEnvironment=setCurrentEnvironment
var assert=require("assert")
var _client_config=require("./client_config")
var setAbilityReload=_client_config.setAbilityReload
var _cmds=require("./cmds")
var cmd_parse=_cmds.cmd_parse
var _net=require("./net")
var netForceDisconnect=_net.netForceDisconnect
var _urlhash=require("./urlhash")
var urlhash=_urlhash
var all_environments={}
var current_environment=null
var default_environment=null
var link_base
var api_path
var texture_base
function applyEnvironment(){link_base=current_environment&&current_environment.link_base||urlhash.getURLBase()
api_path=current_environment&&current_environment.api_path||link_base+"api/"
texture_base=link_base.replace("//localhost:","//127.0.0.1:")}applyEnvironment()
function getCurrentEnvironment(){return current_environment}function setCurrentEnvironment(environment_name){var prev_environment=current_environment
current_environment=environment_name&&all_environments[environment_name]||default_environment
if(current_environment!==prev_environment){applyEnvironment()
setAbilityReload(false)
netForceDisconnect()}}function getLinkBase(){return link_base}function getAPIPath(){return api_path}function getExternalTextureURL(url){return url.match(/^.{2,7}:/)?url:""+texture_base+url}function environmentsInit(environments,default_environment_name){all_environments={}
var all_names=[]
for(var i=0,len=environments.length;i<len;i++){var env=environments[i]
var env_name=env.name
assert(env_name.length>0)
all_environments[env_name]=env
all_names.push(env_name)}current_environment=default_environment=default_environment_name&&all_environments[default_environment_name]||null
applyEnvironment()
if(!all_names.some(function(name){return name.toLowerCase()==="default"})){all_names.push("default")}cmd_parse.registerValue("environment",{type:cmd_parse.TYPE_STRING,help:"Display or set the current client environment",usage:"Display the current client environment\n  Usage: /environment\n"+("Set the current client environment ("+all_names.join(", ")+")\n  Usage: /environment <environment_name>"),label:"Environment",get:function get(){return JSON.stringify(getCurrentEnvironment()||"default",null,2)},set:setCurrentEnvironment,access_show:["sysadmin"]})}

},{"./client_config":15,"./cmds":16,"./net":43,"./urlhash":71,"assert":undefined}],22:[function(require,module,exports){
"use strict"
exports.errorReportClear=errorReportClear
exports.errorReportDetailsString=errorReportDetailsString
exports.errorReportDisable=errorReportDisable
exports.errorReportIgnoreUncaughtPromises=errorReportIgnoreUncaughtPromises
exports.errorReportSetDetails=errorReportSetDetails
exports.errorReportSetDynamicDetails=errorReportSetDynamicDetails
exports.errorReportSetTimeAccum=errorReportSetTimeAccum
exports.glovErrorReport=glovErrorReport
exports.hasCrashed=hasCrashed
exports.session_uid=void 0
var session_uid=""+String(Date.now()).slice(-8)+String(Math.random()).slice(2,8)
exports.session_uid=session_uid
var _glovClientEnvironments=require("./environments")
var getAPIPath=_glovClientEnvironments.getAPIPath
var _require=require("./fetch.js"),fetch=_require.fetch
var _require2=require("./client_config.js"),PLATFORM=_require2.PLATFORM
var error_report_disabled=false
function errorReportDisable(){error_report_disabled=true}var ignore_promises=false
function errorReportIgnoreUncaughtPromises(){ignore_promises=true}var error_report_details={}
var error_report_dynamic_details={}
function errorReportSetDetails(key,value){if(value){error_report_details[key]=escape(String(value))}else{delete error_report_details[key]}}function errorReportSetDynamicDetails(key,fn){error_report_dynamic_details[key]=fn}errorReportSetDetails("build","1659041116850")
errorReportSetDetails("sesuid",session_uid)
errorReportSetDetails("platform",PLATFORM)
var time_start=Date.now()
errorReportSetDetails("time_start",time_start)
errorReportSetDynamicDetails("url",function(){return escape(location.href)})
errorReportSetDynamicDetails("time_up",function(){return Date.now()-time_start})
var time_accum=0
function errorReportSetTimeAccum(new_value){time_accum=new_value}errorReportSetDynamicDetails("time_accum",function(){return time_accum})
function getDynamicDetail(key){var value=error_report_dynamic_details[key]()
if(!value&&value!==0){return""}return"&"+key+"="+value}function errorReportDetailsString(){return"&"+Object.keys(error_report_details).map(function(k){return k+"="+error_report_details[k]}).join("&")+(""+Object.keys(error_report_dynamic_details).map(getDynamicDetail).join(""))}var last_error_time=0
var crash_idx=0
function hasCrashed(){return crash_idx>0}function errorReportClear(){last_error_time=0
window.debugmsg("",true)}var filtered_errors=/avast_submit|vc_request_action|^Script error\.\n  at \(0:0\)$|^null\n  at null\(null:null\)$|getElementsByTagName\('video'\)|document\.getElementById\("search"\)|change_ua|chrome-extension|setConnectedRobot|Failed to (?:start|stop) the audio device|zaloJSV2|getCookie is not defined|originalPrompt|_AutofillCallbackHandler|sytaxError|bannerNight|privateSpecialRepair/
function glovErrorReport(is_fatal,msg,file,line,col){console.error(msg)
if(is_fatal){++crash_idx
var now=Date.now()
var dt=now-last_error_time
last_error_time=now
if(error_report_disabled){return false}if(dt<30*1e3){return false}if(msg.match(filtered_errors)){return false}}var url=getAPIPath()
url+=(is_fatal?"errorReport":"errorLog")+"?cidx="+crash_idx+"&file="+escape(file)+("&line="+(line||0)+"&col="+(col||0))+("&msg="+escape(msg)+errorReportDetailsString())
fetch({method:"POST",url:url},function(){})
if(ignore_promises&&msg.match(/Uncaught \(in promise\)/)){return false}return true}

},{"./client_config.js":15,"./environments":21,"./fetch.js":24}],23:[function(require,module,exports){
"use strict"
exports.canFollowOfficialPage=canFollowOfficialPage
exports.canJoinOfficialGroup=canJoinOfficialGroup
exports.canShowLiveStreamOverlay=canShowLiveStreamOverlay
exports.fbGetAppScopedUserId=fbGetAppScopedUserId
exports.fbGetLoginInfo=fbGetLoginInfo
exports.fbInstantInit=fbInstantInit
exports.fbInstantIsReady=fbInstantIsReady
exports.fbInstantOnPause=fbInstantOnPause
exports.onready=onready
var _require=require("./social.js"),registerExternalUserInfoProvider=_require.registerExternalUserInfoProvider
var urlhash=require("./urlhash.js")
var local_storage=require("./local_storage.js")
var _require2=require("../common/enums.js"),ID_PROVIDER_FB_INSTANT=_require2.ID_PROVIDER_FB_INSTANT
var _require3=require("./error_report.js"),errorReportSetDynamicDetails=_require3.errorReportSetDynamicDetails
var _require4=require("../common/util.js"),callEach=_require4.callEach,eatPossiblePromise=_require4.eatPossiblePromise
var onreadycallbacks=[]
function onready(callback){if(!onreadycallbacks){return void callback()}onreadycallbacks.push(callback)}function fbInstantIsReady(){return onreadycallbacks===null}var fb_log=[]
function fbInstantLogEvent(event){FBInstant.logEvent(event)
fb_log.push(event)
if(fb_log.length>10){fb_log.splice(0,1)}}var hasSubscribedAlready=false
function initSubscribe(callback,skipShortcut){skipShortcut=skipShortcut||false
function handleSubscribeToBotComplete(){if(callback){setTimeout(callback,1)}}function handleSubscribeToBotFailure(e){if(e&&e.code!=="USER_INPUT"){console.error("handleSubscribeToBotFailure",e)}fbInstantLogEvent("bot_subscribe_failure")
handleSubscribeToBotComplete()}function subscribeToBot(){console.warn("Window social trying to bot subscribe")
if(FBInstant.getSupportedAPIs().indexOf("player.canSubscribeBotAsync")!==-1){FBInstant.player.canSubscribeBotAsync().then(function(canSubscribe){if(canSubscribe){fbInstantLogEvent("bot_subscribe_show")
FBInstant.player.subscribeBotAsync().then(function(){fbInstantLogEvent("bot_subscribe_success")
handleSubscribeToBotComplete()},handleSubscribeToBotFailure).catch(handleSubscribeToBotFailure)}else{handleSubscribeToBotComplete()}}).catch(handleSubscribeToBotFailure)}else{handleSubscribeToBotComplete()}}function handleHomescreenComplete(){subscribeToBot()}function handleCreateShortcutFailure(e){console.error("handleCreateShortcutFailure",e)
fbInstantLogEvent("homescreen_install_failure")
handleHomescreenComplete()}var hasAddedToHomescreen=local_storage.get("instant.hasInstalledShortcut.v2")
function createShortcut(){console.warn("Window social trying to create shortcut")
if(FBInstant.getSupportedAPIs().indexOf("canCreateShortcutAsync")!==-1&&!hasAddedToHomescreen&&!hasSubscribedAlready){hasSubscribedAlready=true
FBInstant.canCreateShortcutAsync().then(function(canCreateShortcut){if(canCreateShortcut){fbInstantLogEvent("homescreen_install_show")
FBInstant.createShortcutAsync().then(function(){local_storage.set("instant.hasInstalledShortcut.v2",true)
fbInstantLogEvent("homescreen_install_success")
handleHomescreenComplete()},function(){fbInstantLogEvent("homescreen_install_useraborted")
handleHomescreenComplete()}).catch(handleCreateShortcutFailure)}else{handleHomescreenComplete()}}).catch(handleCreateShortcutFailure)}else{handleHomescreenComplete()}}if(skipShortcut){subscribeToBot()}else{createShortcut()}}var on_pause=[]
function fbInstantOnPause(cb){on_pause.push(cb)}var can_follow_official_page=false
var can_join_official_group=false
var can_get_live_streams_overlay=false
function fbGetLoginInfo(cb){onready(function(){window.FBInstant.player.getSignedPlayerInfoAsync().then(function(result){if(cb){cb(null,{signature:result.getSignature(),display_name:window.FBInstant.player.getName()})
cb=null}}).catch(function(err){if(cb){cb(err)
cb=null}})})}function mapPlayerToExternalUserInfo(player){return{external_id:player.getID(),name:player.getName(),profile_picture_url:player.getPhoto()}}function fbInstantGetPlayer(cb){onready(function(){var player=window.FBInstant.player
cb(null,player?mapPlayerToExternalUserInfo(player):undefined)})}function fbInstantGetFriends(cb){onready(function(){window.FBInstant.player.getConnectedPlayersAsync().then(function(players){if(cb){var local_cb=cb
cb=null
local_cb(null,players==null?void 0:players.map(mapPlayerToExternalUserInfo))}}).catch(function(err){if(cb){var local_cb=cb
cb=null
local_cb(err)}})})}function fbGetAppScopedUserId(cb){onready(function(){window.FBInstant.player.getASIDAsync().then(function(asid){if(cb){cb(null,asid)
cb=null}}).catch(function(err){if(cb){cb(err)
cb=null}})})}function canFollowOfficialPage(){return window.FBInstant&&can_follow_official_page}function canJoinOfficialGroup(){return window.FBInstant&&can_join_official_group}function canShowLiveStreamOverlay(){return window.FBInstant&&can_get_live_streams_overlay}function fbInstantInit(){if(!window.FBInstant){return}errorReportSetDynamicDetails("fblog",function(){return fb_log.join(",")})
registerExternalUserInfoProvider(ID_PROVIDER_FB_INSTANT,fbInstantGetPlayer,fbInstantGetFriends)
var left=1
var fake_load_interval=setInterval(function(){left*=.9
eatPossiblePromise(FBInstant.setLoadingProgress(100-left*100>>0))},100)
FBInstant.initializeAsync().then(function(){var entryPointData=FBInstant.getEntryPointData()||{}
var querystring=entryPointData.querystring||{}
for(var x in querystring){urlhash.set(x,querystring[x])}clearInterval(fake_load_interval)
FBInstant.startGameAsync().then(function(){callEach(onreadycallbacks,onreadycallbacks=null)
console.log("Initializing FBInstant")
initSubscribe(function(){console.log("All done initing FBInstant")
window.FBInstant.community.canFollowOfficialPageAsync().then(function(state){can_follow_official_page=state}).catch(function(err){console.error(err)})
window.FBInstant.community.canJoinOfficialGroupAsync().then(function(state){can_join_official_group=state}).catch(function(err){console.error(err)})
window.FBInstant.community.canGetLiveStreamsAsync().then(function(state){can_get_live_streams_overlay=state}).catch(function(err){console.error(err)})})})}).catch(function(e){console.warn("FBInstant initializeAsync failed",e)})
FBInstant.onPause(function(){callEach(on_pause)})}

},{"../common/enums.js":82,"../common/util.js":89,"./error_report.js":22,"./local_storage.js":38,"./social.js":60,"./urlhash.js":71}],24:[function(require,module,exports){
"use strict"
exports.ERR_CONNECTION=void 0
exports.fetch=fetch
var assert=require("assert")
var _require=require("../common/util.js"),once=_require.once
var ERR_CONNECTION="ERR_CONNECTION"
exports.ERR_CONNECTION=ERR_CONNECTION
var regex_with_host=/\/\/[^/]+\/([^?#]+)/
var regex_no_host=/([^?#]+)/
function labelFromURL(url){var m=url.match(regex_with_host)
if(m){return m[1]}m=url.match(regex_no_host)
return m?m[1]:url}function fetch(params,cb){cb=once(cb)
var method=params.method,url=params.url,response_type=params.response_type,label=params.label
method=method||"GET"
assert(url)
label=label||labelFromURL(url)
var xhr=new XMLHttpRequest
xhr.open(method,url,true)
if(response_type&&response_type!=="json"){xhr.responseType=response_type}xhr.onload=function(){profilerStart("fetch_onload:"+label)
if(xhr.status!==200&&xhr.status!==0){var text
try{text=xhr.responseText}catch(e){}cb(String(xhr.status),text||"")}else{if(response_type==="json"){var _text
var obj
try{_text=xhr.responseText
obj=JSON.parse(_text)}catch(e){console.error("Received invalid JSON response from "+url+": "+(_text||"<empty response>"))
cb(e)
profilerStop()
return}cb(null,obj)}else if(response_type==="arraybuffer"){if(xhr.response){cb(null,xhr.response)}else{cb("empty response")}}else{cb(null,xhr.responseText)}}profilerStop()}
xhr.onerror=function(){profilerStart("fetch_onerror:"+label)
cb(ERR_CONNECTION)
profilerStop()}
xhr.send(null)}

},{"../common/util.js":89,"assert":undefined}],25:[function(require,module,exports){
"use strict"
exports.filewatchMessageHandler=filewatchMessageHandler
exports.filewatchOn=filewatchOn
exports.filewatchStartup=filewatchStartup
exports.filewatchTriggerChange=filewatchTriggerChange
var assert=require("assert")
var by_ext={}
var by_match=[]
function filewatchOn(ext_or_search,cb){if(ext_or_search[0]==="."){assert(!by_ext[ext_or_search])
by_ext[ext_or_search]=cb}else{by_match.push([ext_or_search,cb])}}var message_cb
function filewatchMessageHandler(cb){message_cb=cb}function onFileChange(filename){console.log("FileWatch change: "+filename)
var ext_idx=filename.lastIndexOf(".")
var did_reload=false
if(ext_idx!==-1){var ext=filename.slice(ext_idx)
if(by_ext[ext]){if(by_ext[ext](filename)!==false){did_reload=true}}}for(var ii=0;ii<by_match.length;++ii){if(filename.match(by_match[ii][0])){if(by_match[ii][1](filename)!==false){did_reload=true}}}if(message_cb&&did_reload){message_cb("Reloading: "+filename)}}function filewatchTriggerChange(filename){onFileChange(filename)}function filewatchStartup(client){client.onMsg("filewatch",onFileChange)}

},{"assert":undefined}],26:[function(require,module,exports){
"use strict"
exports.ALIGN=void 0
exports.fontCreate=fontCreate
exports.fontSetDefaultSize=fontSetDefaultSize
exports.fontStyle=fontStyle
exports.fontStyleAlpha=fontStyleAlpha
exports.fontStyleColored=fontStyleColored
exports.fontTick=fontTick
exports.glov_font_default_style=exports.font_shaders=void 0
exports.intColorFromVec4Color=intColorFromVec4Color
exports.vec4ColorFromIntColor=vec4ColorFromIntColor
exports.style=fontStyle
exports.styleColored=fontStyleColored
exports.styleAlpha=fontStyleAlpha
exports.create=fontCreate
var assert=require("assert")
var camera2d=require("./camera2d.js")
var _require=require("./camera2d.js"),transformX=_require.transformX,transformY=_require.transformY
var engine=require("./engine.js")
var geom=require("./geom.js")
var _require2=require("./localization.js"),getStringFromLocalizable=_require2.getStringFromLocalizable
var max=Math.max,min=Math.min,round=Math.round
var shaders=require("./shaders.js")
var sprites=require("./sprites.js")
var BLEND_ALPHA=sprites.BLEND_ALPHA,BLEND_PREMULALPHA=sprites.BLEND_PREMULALPHA,spriteChainedStart=sprites.spriteChainedStart,spriteChainedStop=sprites.spriteChainedStop,spriteDataAlloc=sprites.spriteDataAlloc
var textures=require("./textures.js")
var _require3=require("../common/util.js"),clamp=_require3.clamp
var _require4=require("../common/vmath.js"),v3scale=_require4.v3scale,v3set=_require4.v3set,vec4=_require4.vec4,v4copy=_require4.v4copy,v4scale=_require4.v4scale
var ALIGN={HLEFT:0,HCENTER:1,HRIGHT:2,HMASK:3,VTOP:0<<2,VCENTER:1<<2,VBOTTOM:2<<2,VMASK:3<<2,HFIT:1<<4,HWRAP:1<<5,HCENTERFIT:1|1<<4,HRIGHTFIT:2|1<<4,HVCENTER:1|1<<2,HVCENTERFIT:1|1<<2|1<<4}
exports.ALIGN=ALIGN
var ALIGN_NEEDS_WIDTH=ALIGN.HMASK|ALIGN.HFIT
function GlovFontStyle(){this.color_vec4=new Float32Array([1,1,1,1])}GlovFontStyle.prototype.outline_width=0
GlovFontStyle.prototype.outline_color=0
GlovFontStyle.prototype.glow_xoffs=0
GlovFontStyle.prototype.glow_yoffs=0
GlovFontStyle.prototype.glow_inner=0
GlovFontStyle.prototype.glow_outer=0
GlovFontStyle.prototype.glow_color=0
GlovFontStyle.prototype.color=4294967295
var font_shaders={}
exports.font_shaders=font_shaders
function intColorFromVec4Color(v){return(v[0]*255|0)<<24|(v[1]*255|0)<<16|(v[2]*255|0)<<8|(v[3]*255|0)}function vec4ColorFromIntColor(v,c){v[0]=(c>>24&255)/255
v[1]=(c>>16&255)/255
v[2]=(c>>8&255)/255
v[3]=(c&255)/255}function vec4ColorFromIntColorPreMultiplied(v,c){var a=v[3]=(c&255)/255
a*=1/255
v[0]=(c>>24&255)*a
v[1]=(c>>16&255)*a
v[2]=(c>>8&255)*a}var glov_font_default_style=new GlovFontStyle
exports.glov_font_default_style=glov_font_default_style
function fontStyle(font_style,fields){var ret=new GlovFontStyle
var color_vec4=ret.color_vec4
if(font_style){for(var f in font_style){ret[f]=font_style[f]}}for(var _f in fields){ret[_f]=fields[_f]}ret.color_vec4=color_vec4
vec4ColorFromIntColor(ret.color_vec4,ret.color)
return ret}function fontStyleColored(font_style,color){return fontStyle(font_style,{color:color})}function colorAlpha(color,alpha){alpha=clamp(round((color&255)*alpha),0,255)
return color&4294967040|alpha}function fontStyleAlpha(font_style,alpha){return fontStyle(font_style,{color:colorAlpha((font_style||glov_font_default_style).color,alpha),outline_color:colorAlpha((font_style||glov_font_default_style).outline_color,alpha),glow_color:colorAlpha((font_style||glov_font_default_style).glow_color,alpha)})}var tech_params=null
var tech_params_dirty=false
var tech_params_cache=[]
var tech_params_cache_idx=0
var tech_params_pool=[]
var tech_params_pool_idx=0
var temp_color=vec4()
var geom_stats
var dsp={}
function techParamsAlloc(){if(tech_params_pool_idx===tech_params_pool.length){tech_params_pool.push({param0:vec4(),outline_color:vec4(),glow_color:vec4(),glow_params:vec4()})}tech_params=tech_params_pool[tech_params_pool_idx++]}function fontStartup(){if(tech_params){return}geom_stats=geom.stats
techParamsAlloc()}function techParamsSet(param,value){var tpv=tech_params[param]
if(!tech_params_dirty){if(tpv[0]!==value[0]||tpv[1]!==value[1]||tpv[2]!==value[2]||tpv[3]!==value[3]){var old_tech_params=tech_params
techParamsAlloc()
v4copy(tech_params.param0,old_tech_params.param0)
v4copy(tech_params.outline_color,old_tech_params.outline_color)
v4copy(tech_params.glow_color,old_tech_params.glow_color)
v4copy(tech_params.glow_params,old_tech_params.glow_params)
geom_stats.font_params++
tech_params_dirty=true
tpv=tech_params[param]}else{return}}if(tech_params_dirty){tpv[0]=value[0]
tpv[1]=value[1]
tpv[2]=value[2]
tpv[3]=value[3]}}var SHADER_KEYS=["param0","outline_color","glow_color","glow_params"]
function sameTP(as){for(var jj=0;jj<4;++jj){var key=SHADER_KEYS[jj]
var v1=tech_params[key]
var v2=as[key]
for(var ii=0;ii<4;++ii){if(v1[ii]!==v2[ii]){return false}}}return true}function techParamsGet(){if(!tech_params_dirty){return tech_params}tech_params_dirty=false
for(var ii=0;ii<tech_params_cache.length;++ii){if(sameTP(tech_params_cache[ii])){if(tech_params===tech_params_pool[tech_params_pool_idx-1]){tech_params_pool_idx--}tech_params=tech_params_cache[ii]
if(tech_params_cache_idx===ii){tech_params_cache_idx=(tech_params_cache_idx+1)%4}--geom_stats.font_params
return tech_params}}tech_params_cache[tech_params_cache_idx]=tech_params
tech_params_cache_idx=(tech_params_cache_idx+1)%4
return tech_params}function GlovFont(font_info,texture_name){assert(font_info.font_size!==0)
this.texture=textures.load({url:"img/"+texture_name+".png",filter_min:font_info.noFilter?gl.NEAREST:gl.LINEAR,filter_mag:font_info.noFilter?gl.NEAREST:gl.LINEAR,wrap_s:gl.CLAMP_TO_EDGE,wrap_t:gl.CLAMP_TO_EDGE})
this.textures=[this.texture]
this.integral=Boolean(font_info.noFilter)
this.font_info=font_info
this.font_size=font_info.font_size
this.inv_font_size=1/font_info.font_size
this.shader=font_shaders.font_aa
this.tex_w=font_info.imageW
this.tex_h=font_info.imageH
for(var ii=0;ii<font_info.char_infos.length;++ii){var char_info=font_info.char_infos[ii]
char_info.scale=1/(char_info.sc||1)
char_info.w=char_info.w||0}this.char_infos=[]
for(var _ii=0;_ii<font_info.char_infos.length;++_ii){var _char_info=font_info.char_infos[_ii]
this.char_infos[font_info.char_infos[_ii].c]=_char_info
_char_info.xpad=_char_info.xpad||0
_char_info.yoffs=_char_info.yoffs||0
_char_info.w_pad_scale=(_char_info.w+_char_info.xpad)*_char_info.scale}this.replacement_character=this.infoFromChar(65533)
if(!this.replacement_character){this.replacement_character=this.infoFromChar(63)}this.whitespace_character=this.infoFromChar(13)
this.default_style=new GlovFontStyle
this.applied_style=new GlovFontStyle
fontStartup()}GlovFont.prototype.drawSizedColor=function(style,x,y,z,size,color,text){return this.drawSized(fontStyleColored(style,color),x,y,z,size,text)}
GlovFont.prototype.drawSized=function(style,x,y,z,size,text){dsp.style=style
dsp.x=x
dsp.y=y
dsp.z=z
dsp.xsc=size*this.inv_font_size
dsp.ysc=size*this.inv_font_size
dsp.text=text
return this.drawScaled()}
GlovFont.prototype.drawSizedAligned=function(style,x,y,z,size,align,w,h,text){profilerStart("drawSizedAligned")
text=getStringFromLocalizable(text)
if(align&ALIGN.HWRAP){var drawn_height=this.drawSizedAlignedWrapped(style,x,y,z,0,size,align&~ALIGN.HWRAP,w,h,text)
profilerStop("drawSizedAligned")
return drawn_height}var x_size=size
var y_size=size
if(align&ALIGN_NEEDS_WIDTH){var width=this.getStringWidth(style,x_size,text)
if(align&ALIGN.HFIT&&width>w){var scale=w/width
x_size*=scale
width=w
if(scale<.5){if((align&ALIGN.VMASK)!==ALIGN.VCENTER&&(align&ALIGN.VMASK)!==ALIGN.VBOTTOM){y+=(y_size-y_size*scale*2)*.5}y_size*=scale*2}}switch(align&ALIGN.HMASK){case ALIGN.HCENTER:x+=(w-width)*.5
if(this.integral){x|=0}break
case ALIGN.HRIGHT:x+=w-width
break}}switch(align&ALIGN.VMASK){case ALIGN.VCENTER:y+=(h-y_size)*.5
if(this.integral){y|=0}break
case ALIGN.VBOTTOM:y+=h-y_size
break}var xsc=x_size*this.inv_font_size
var ysc=y_size*this.inv_font_size
dsp.style=style
dsp.x=x
dsp.y=y
dsp.z=z
dsp.xsc=xsc
dsp.ysc=ysc
dsp.text=text
var drawn_width=this.drawScaled()
profilerStop("drawSizedAligned")
return drawn_width}
GlovFont.prototype.drawSizedAlignedWrapped=function(style,x,y,z,indent,size,align,w,h,text){text=getStringFromLocalizable(text)
assert(w>0)
assert(typeof h!=="string")
var lines=[]
var line_xoffs=[]
lines.length=this.wrapLines(style,w,indent,size,text,align,function(xoffs,linenum,line){line_xoffs[linenum]=xoffs
lines[linenum]=line})
var yoffs=0
var height=size*lines.length
switch(align&ALIGN.VMASK){case ALIGN.VCENTER:yoffs=(h-height)/2
if(this.integral){yoffs|=0}break
case ALIGN.VBOTTOM:yoffs=h-height
break}align&=~ALIGN.VMASK
for(var ii=0;ii<lines.length;++ii){var line=lines[ii]
if(line&&line.trim()){this.drawSizedAligned(style,x+line_xoffs[ii],y+yoffs,z,size,align,w-line_xoffs[ii],0,line)}yoffs+=size}return yoffs}
GlovFont.prototype.drawSizedColorWrapped=function(style,x,y,z,w,indent,size,color,text){return this.drawScaledWrapped(fontStyleColored(style,color),x,y,z,w,indent,size*this.inv_font_size,size*this.inv_font_size,text)}
GlovFont.prototype.drawSizedWrapped=function(style,x,y,z,w,indent,size,text){return this.drawScaledWrapped(style,x,y,z,w,indent,size*this.inv_font_size,size*this.inv_font_size,text)}
var default_size=24
function fontSetDefaultSize(h){default_size=h}GlovFont.prototype.draw=function(param){var style=param.style,color=param.color,alpha=param.alpha,x=param.x,y=param.y,z=param.z,size=param.size,w=param.w,h=param.h,align=param.align,text=param.text,indent=param.indent
if(color){style=fontStyleColored(style,color)}if(alpha!==undefined){style=fontStyleAlpha(style,alpha)}indent=indent||0
size=size||default_size
z=z||Z.UI
if(align){if(align&ALIGN.HWRAP){return this.drawSizedAlignedWrapped(style,x,y,z,indent,size,align&~ALIGN.HWRAP,w,h,text)}return this.drawSizedAligned(style,x,y,z,size,align,w||0,h||0,text)}else{return this.drawSized(style,x,y,z,size,text)}}
GlovFont.prototype.wrapLines=function(style,w,indent,size,text,align,line_cb){assert(typeof style!=="number")
this.applyStyle(style)
return this.wrapLinesScaled(w,indent,size*this.inv_font_size,text,align,line_cb)}
GlovFont.prototype.numLines=function(style,w,indent,size,text){return this.wrapLines(style,w,indent,size,text,0)}
GlovFont.prototype.dims=function(style,w,indent,size,text){var max_x1=0
function lineCallback(ignored1,ignored2,line,x1){max_x1=max(max_x1,x1)}var numlines=this.wrapLines(style,w,indent,size,text,0,lineCallback)
return{w:max_x1,h:numlines*size}}
GlovFont.prototype.infoFromChar=function(c){var ret=this.char_infos[c]
if(ret){return ret}if(c>=9&&c<=13){return this.whitespace_character}return this.replacement_character}
GlovFont.prototype.getCharacterWidth=function(style,x_size,c){assert.equal(typeof c,"number")
this.applyStyle(style)
var char_info=this.infoFromChar(c)
var xsc=x_size*this.inv_font_size
var x_advance=this.calcXAdvance(xsc)
if(char_info){return char_info.w_pad_scale*xsc+x_advance}return 0}
GlovFont.prototype.getStringWidth=function(style,x_size,text){text=getStringFromLocalizable(text)
this.applyStyle(style)
var ret=0
var xsc=x_size*this.inv_font_size
var x_advance=this.calcXAdvance(xsc)
for(var ii=0;ii<text.length;++ii){var c=text.charCodeAt(ii)
var char_info=this.infoFromChar(c)
if(char_info){ret+=char_info.w_pad_scale*xsc+x_advance}}return ret}
GlovFont.prototype.getSpaceSize=function(xsc){var space_info=this.infoFromChar(32)
return(space_info?(space_info.w+space_info.xpad)*space_info.scale:this.font_size)*xsc}
function endsWord(char_code){return char_code===32||char_code===0||char_code===10||char_code===9}GlovFont.prototype.wrapLinesScaled=function(w,indent,xsc,text,align,line_cb){text=getStringFromLocalizable(text)
assert(typeof align!=="function")
var len=text.length
var max_word_w=w-indent
var hard_wrap_mode_fit=align&ALIGN.HFIT
var x_advance=this.calcXAdvance(xsc)
var space_size=this.getSpaceSize(xsc)+x_advance
var idx=0
var line_start=0
var line_x0=0
var line_x1=0
var line_end=-1
var word_start=0
var word_x0=0
var word_w=0
var word_slice=-1
var word_slice_w=0
var linenum=0
function flushLine(){if(line_end!==-1&&line_cb){line_cb(line_x0,linenum,text.slice(line_start,line_end),line_x1)}linenum++
line_x0=indent
line_x1=-1
line_start=word_start
line_end=-1
word_x0=line_x0}do{var c=idx<len?text.charCodeAt(idx)||65533:0
if(endsWord(c)){if(word_start!==idx){var need_line_flush=false
if(word_x0+word_w<=w){}else if(word_w>max_word_w&&!hard_wrap_mode_fit){need_line_flush=true
if(word_slice===-1){if(line_end!==-1){flushLine()}idx=line_start+1
word_w=max_word_w}else{idx=word_slice
word_w=word_slice_w}}else{if(line_end!==-1){flushLine()}}line_end=idx
line_x1=word_x0+word_w
word_x0=line_x1
word_w=0
word_start=idx
word_slice=-1
if(need_line_flush){flushLine()}continue}else{word_start=idx+1
word_x0+=space_size
if(c===10){flushLine()}}}else{var char_info=this.infoFromChar(c)
if(char_info){var char_w=char_info.w_pad_scale*xsc+x_advance
word_w+=char_w
if(word_x0+word_w<=w){word_slice=idx+1
word_slice_w=word_w}}}++idx}while(idx<=len)
if(line_end!==-1){flushLine()}return linenum}
GlovFont.prototype.drawScaledWrapped=function(style,x,y,z,w,indent,xsc,ysc,text){var _this=this
if(text===null||text===undefined){text="(null)"}assert(w>0)
this.applyStyle(style)
this.last_width=0
dsp.style=style
dsp.z=z
dsp.xsc=xsc
dsp.ysc=ysc
var num_lines=this.wrapLinesScaled(w,indent,xsc,text,0,function(xoffs,linenum,line,x1){dsp.x=x+xoffs
dsp.y=y+_this.font_size*ysc*linenum
dsp.text=line
_this.drawScaled()
_this.last_width=max(_this.last_width,x1)})
return num_lines*this.font_size*ysc}
GlovFont.prototype.calcXAdvance=function(xsc){var font_texel_scale=this.font_size/32
var x_advance=round(xsc*font_texel_scale*max(this.applied_style.outline_width-2,0))
x_advance=max(x_advance,xsc*font_texel_scale*max(this.applied_style.glow_outer-this.applied_style.glow_xoffs-3,0))
return x_advance}
var temp_vec4_param0=vec4()
var temp_vec4_glow_params=vec4()
var padding4=vec4()
var padding_in_font_space=vec4()
GlovFont.prototype.drawScaled=function(){var style=dsp.style,_x=dsp.x,y=dsp.y,z=dsp.z,xsc=dsp.xsc,ysc=dsp.ysc,text=dsp.text
profilerStart("drawScaled")
text=getStringFromLocalizable(text)
var x=_x
assert(isFinite(x))
assert(isFinite(y))
assert(isFinite(z))
var font_info=this.font_info
y+=(font_info.y_offset||0)*ysc
var texs=this.textures
if(text===null||text===undefined){text="(null)"}var len=text.length
if(xsc===0||ysc===0){profilerStop("drawScaled")
return 0}geom_stats.font_calls++
this.applyStyle(style)
var blend_mode=engine.defines.NOPREMUL?BLEND_ALPHA:BLEND_PREMULALPHA
var avg_scale_font=(xsc+ysc)*.5
var camera_xscale=camera2d.data[4]
var camera_yscale=camera2d.data[5]
var avg_scale_combined=(xsc*camera_xscale+ysc*camera_yscale)*.5
var x_advance=this.calcXAdvance(xsc)
var font_texel_scale=this.font_size/32
var tile_state=0
var applied_style=this.applied_style
var delta_per_source_pixel=.5/font_info.spread
var delta_per_dest_pixel=delta_per_source_pixel/avg_scale_combined
var value=v3set(temp_vec4_param0,1/delta_per_dest_pixel,-.5/delta_per_dest_pixel+.5,min(0,-.5/delta_per_dest_pixel+.5+applied_style.outline_width*font_texel_scale*avg_scale_combined))
var padding1=max(0,applied_style.outline_width*font_texel_scale*avg_scale_font)
var outer_scaled=applied_style.glow_outer*font_texel_scale
padding4[0]=max(outer_scaled*xsc-applied_style.glow_xoffs*font_texel_scale*xsc,padding1)
padding4[2]=max(outer_scaled*xsc+applied_style.glow_xoffs*font_texel_scale*xsc,padding1)
padding4[1]=max(outer_scaled*ysc-applied_style.glow_yoffs*font_texel_scale*ysc,padding1)
padding4[3]=max(outer_scaled*ysc+applied_style.glow_yoffs*font_texel_scale*ysc,padding1)
techParamsSet("param0",value)
var value2=temp_vec4_glow_params
value2[2]=1/((applied_style.glow_outer-applied_style.glow_inner)*delta_per_source_pixel*font_texel_scale)
value2[3]=min(0,-(.5-applied_style.glow_outer*delta_per_source_pixel*font_texel_scale)/((applied_style.glow_outer-applied_style.glow_inner)*delta_per_source_pixel*font_texel_scale))
v4scale(padding_in_font_space,padding4,1/avg_scale_font)
for(var ii=0;ii<4;++ii){if(padding_in_font_space[ii]>font_info.spread){var sc=font_info.spread/padding_in_font_space[ii]
padding4[ii]*=sc
padding_in_font_space[ii]*=sc}}var z_advance=applied_style.glow_xoffs<0?-1e-4:0
if(!z_advance){spriteChainedStart()}var has_glow_offs=applied_style.glow_xoffs||applied_style.glow_yoffs
if(!has_glow_offs){value2[0]=value2[1]=0
techParamsSet("glow_params",value2)
techParamsGet()}var rel_x_scale=xsc/avg_scale_font
var rel_y_scale=ysc/avg_scale_font
var sort_y=transformY(y)
var color=applied_style.color_vec4
var shader=this.shader
for(var i=0;i<len;i++){var c=text.charCodeAt(i)
if(c===9){var tabsize=xsc*this.font_size*4
x=(((x-_x)/tabsize|0)+1)*tabsize+_x}else{var char_info=this.infoFromChar(c)
if(char_info){var char_scale=char_info.scale
var xsc2=xsc*char_scale
if(char_info.w){var ysc2=ysc*char_scale
var pad_scale=1/char_scale
var tile_width=this.tex_w
var tile_height=this.tex_h
if(has_glow_offs&&char_scale!==tile_state){value2[0]=-applied_style.glow_xoffs*font_texel_scale*pad_scale/tile_width
value2[1]=-applied_style.glow_yoffs*font_texel_scale*pad_scale/tile_height
techParamsSet("glow_params",value2)
if(!z_advance){spriteChainedStop()
spriteChainedStart()}techParamsGet()
tile_state=char_scale}var u0=(char_info.x0-padding_in_font_space[0]*pad_scale)/tile_width
var u1=(char_info.x0+char_info.w+padding_in_font_space[2]*pad_scale)/tile_width
var v0=(char_info.y0-padding_in_font_space[1]*pad_scale)/tile_height
var v1=(char_info.y0+char_info.h+padding_in_font_space[3]*pad_scale)/tile_height
var w=char_info.w*xsc2+(padding4[0]+padding4[2])*rel_x_scale
var h=char_info.h*ysc2+(padding4[1]+padding4[3])*rel_y_scale
var xx=x-rel_x_scale*padding4[0]
var yy=y-rel_y_scale*padding4[2]+char_info.yoffs*ysc2
var y1=yy+h
var x1=xx+w
var zz=z+z_advance*i
var tx0=transformX(xx)
var ty0=transformY(yy)
var tx1=transformX(x1)
var ty1=transformY(y1)
var elem=spriteDataAlloc(texs,shader,tech_params,blend_mode)
var data=elem.data
data[0]=tx0
data[1]=ty0
data[2]=color[0]
data[3]=color[1]
data[4]=color[2]
data[5]=color[3]
data[6]=u0
data[7]=v0
data[8]=tx0
data[9]=ty1
data[10]=color[0]
data[11]=color[1]
data[12]=color[2]
data[13]=color[3]
data[14]=u0
data[15]=v1
data[16]=tx1
data[17]=ty1
data[18]=color[0]
data[19]=color[1]
data[20]=color[2]
data[21]=color[3]
data[22]=u1
data[23]=v1
data[24]=tx1
data[25]=ty0
data[26]=color[0]
data[27]=color[1]
data[28]=color[2]
data[29]=color[3]
data[30]=u1
data[31]=v0
elem.x=tx0
elem.y=sort_y
elem.queue(zz)}x+=(char_info.w+char_info.xpad)*xsc2+x_advance}}}if(!z_advance){spriteChainedStop()}profilerStop("drawScaled")
return x-_x}
GlovFont.prototype.determineShader=function(){var outline=this.applied_style.outline_width&&this.applied_style.outline_color&255
var glow=this.applied_style.glow_outer>0&&this.applied_style.glow_color&255
if(outline){if(glow){this.shader=font_shaders.font_aa_outline_glow}else{this.shader=font_shaders.font_aa_outline}}else if(glow){this.shader=font_shaders.font_aa_glow}else{this.shader=font_shaders.font_aa}}
GlovFont.prototype.applyStyle=function(style){if(!style){style=this.default_style}if(engine.defines.NOPREMUL){vec4ColorFromIntColor(temp_color,style.outline_color)
techParamsSet("outline_color",temp_color)
vec4ColorFromIntColor(temp_color,style.glow_color)
techParamsSet("glow_color",temp_color)}else{vec4ColorFromIntColorPreMultiplied(temp_color,style.outline_color)
techParamsSet("outline_color",temp_color)
vec4ColorFromIntColorPreMultiplied(temp_color,style.glow_color)
techParamsSet("glow_color",temp_color)}this.applied_style.outline_width=style.outline_width
this.applied_style.outline_color=style.outline_color
this.applied_style.glow_xoffs=style.glow_xoffs
this.applied_style.glow_yoffs=style.glow_yoffs
this.applied_style.glow_inner=style.glow_inner
this.applied_style.glow_outer=style.glow_outer
this.applied_style.glow_color=style.glow_color
this.applied_style.color=style.color
if(engine.defines.NOPREMUL){v4copy(this.applied_style.color_vec4,style.color_vec4)}else{var alpha=this.applied_style.color_vec4[3]=style.color_vec4[3]
v3scale(this.applied_style.color_vec4,style.color_vec4,alpha)}this.determineShader()}
GlovFont.prototype.ALIGN=ALIGN
GlovFont.prototype.style=fontStyle
GlovFont.prototype.styleAlpha=fontStyleAlpha
GlovFont.prototype.styleColored=fontStyleColored
function fontShadersInit(){if(font_shaders.font_aa){return}font_shaders.font_aa=shaders.create("shaders/font_aa.fp")
font_shaders.font_aa_glow=shaders.create("shaders/font_aa_glow.fp")
font_shaders.font_aa_outline=shaders.create("shaders/font_aa_outline.fp")
font_shaders.font_aa_outline_glow=shaders.create("shaders/font_aa_outline_glow.fp")
shaders.prelink(sprites.sprite_vshader,font_shaders.font_aa)
shaders.prelink(sprites.sprite_vshader,font_shaders.font_aa_glow)
shaders.prelink(sprites.sprite_vshader,font_shaders.font_aa_outline)
shaders.prelink(sprites.sprite_vshader,font_shaders.font_aa_outline_glow)}function fontCreate(font_info,texture_name){fontShadersInit()
return new GlovFont(font_info,texture_name)}function fontTick(){tech_params_cache_idx=0
tech_params_cache.length=0
tech_params_pool_idx=0}

},{"../common/util.js":89,"../common/vmath.js":91,"./camera2d.js":13,"./engine.js":20,"./geom.js":28,"./localization.js":39,"./shaders.js":57,"./sprites.js":65,"./textures.js":67,"assert":undefined}],27:[function(require,module,exports){
"use strict"
exports.framebufferCapture=framebufferCapture
exports.framebufferEnd=framebufferEnd
exports.framebufferEndOfFrame=framebufferEndOfFrame
exports.framebufferSkipRelease=framebufferSkipRelease
exports.framebufferStart=framebufferStart
exports.framebufferTopOfFrame=framebufferTopOfFrame
exports.framebufferUpdateCanvasForCapture=framebufferUpdateCanvasForCapture
exports.temporaryTextureClaim=temporaryTextureClaim
var assert=require("assert")
var _require=require("./browser.js"),is_ios=_require.is_ios
var _require2=require("./cmds.js"),cmd_parse=_require2.cmd_parse
var _require3=require("./effects.js"),applyCopy=_require3.applyCopy
var engine=require("./engine.js")
var renderWidth=engine.renderWidth,renderHeight=engine.renderHeight
var perf=require("./perf.js")
var settings=require("./settings.js")
var textures=require("./textures.js")
var last_num_passes=0
var num_passes=0
var temporary_textures={}
var temporary_depthbuffers={}
var temporary_depthtextures={}
var reset_fbos=false
function resetFBOs(){reset_fbos=true}var skip_release=false
function framebufferSkipRelease(){skip_release=true}var last_temp_idx=0
function getTemporaryTexture(w,h,possibly_fbo){var key=w+"_"+h
var is_fbo=possibly_fbo&&settings.use_fbos
if(is_fbo){key+="_fbo"}var temp=temporary_textures[key]
if(!temp){temp=temporary_textures[key]={list:[],idx:0}}if(temp.idx>=temp.list.length){var _tex=textures.createForCapture("temp_"+key+"_"+ ++last_temp_idx)
if(is_fbo){_tex.allocFBO(w,h)}temp.list.push(_tex)}var tex=temp.list[temp.idx++]
return tex}function bindTemporaryDepthbuffer(w,h){var key=w+"_"+h
var temp=temporary_depthbuffers[key]
if(!temp){temp=temporary_depthbuffers[key]={list:[],idx:0}}if(temp.idx>=temp.list.length){var _depth_buffer=gl.createRenderbuffer()
gl.bindRenderbuffer(gl.RENDERBUFFER,_depth_buffer)
var _attachment
if(settings.fbo_depth16){gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,w,h)
_attachment=gl.DEPTH_ATTACHMENT}else{gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_STENCIL,w,h)
_attachment=gl.DEPTH_STENCIL_ATTACHMENT}gl.bindRenderbuffer(gl.RENDERBUFFER,null)
temp.list.push({depth_buffer:_depth_buffer,attachment:_attachment})}var _temp$list$temp$idx=temp.list[temp.idx++],depth_buffer=_temp$list$temp$idx.depth_buffer,attachment=_temp$list$temp$idx.attachment
gl.framebufferRenderbuffer(gl.FRAMEBUFFER,attachment,gl.RENDERBUFFER,depth_buffer)}function bindTemporaryDepthbufferTexture(w,h){var key=w+"_"+h
var temp=temporary_depthtextures[key]
if(!temp){temp=temporary_depthtextures[key]={list:[],idx:0}}if(temp.idx>=temp.list.length){var _tex2=textures.createForDepthCapture("temp_"+key+"_"+ ++last_temp_idx,settings.fbo_depth16?textures.format.DEPTH16:textures.format.DEPTH24)
_tex2.allocDepth(w,h)
var _attachment2=settings.fbo_depth16?gl.DEPTH_ATTACHMENT:gl.DEPTH_STENCIL_ATTACHMENT
temp.list.push({tex:_tex2,attachment:_attachment2})}var _temp$list$temp$idx2=temp.list[temp.idx++],tex=_temp$list$temp$idx2.tex,attachment=_temp$list$temp$idx2.attachment
gl.framebufferTexture2D(gl.FRAMEBUFFER,attachment,gl.TEXTURE_2D,tex.handle,0)
return tex}function temporaryTextureClaim(tex){for(var key in temporary_textures){var temp=temporary_textures[key]
var idx=temp.list.indexOf(tex)
if(idx!==-1){temp.list.splice(idx,1)
if(temp.idx>idx){--temp.idx}return}}assert(false)}function framebufferCaptureStart(tex,w,h,possibly_fbo){assert.equal(engine.viewport[0],0)
assert.equal(engine.viewport[1],0)
if(!w){w=renderWidth()
h=renderHeight()}if(!tex){tex=getTemporaryTexture(w,h,possibly_fbo)}tex.captureStart(w,h)
return tex}function framebufferCapture(tex,w,h,filter_linear,wrap){tex=framebufferCaptureStart(tex,w,h,false)
tex.captureEnd(filter_linear,wrap)
return tex}var cur_tex
var cur_depth
function framebufferStart(opts){assert(!cur_tex)
assert(!cur_depth)
var width=opts.width,height=opts.height,viewport=opts.viewport,final=opts.final,clear=opts.clear,need_depth=opts.need_depth,clear_all=opts.clear_all,clear_color=opts.clear_color,force_tex=opts.force_tex;++num_passes
cur_depth=null
if(force_tex){assert(viewport)
cur_tex=force_tex
cur_tex.captureStart()}else if(!final){cur_tex=framebufferCaptureStart(null,width,height,true)
if(settings.use_fbos){if(need_depth){if(need_depth==="texture"){cur_depth=bindTemporaryDepthbufferTexture(width,height)}else{bindTemporaryDepthbuffer(width,height)}}else{}}}if(clear_color){gl.clearColor(clear_color[0],clear_color[1],clear_color[2],clear_color[3])}if(clear&&clear_all){gl.disable(gl.SCISSOR_TEST)
gl.clear(gl.COLOR_BUFFER_BIT|(need_depth?gl.DEPTH_BUFFER_BIT:0))}var need_scissor
if(viewport){engine.setViewport(viewport)
need_scissor=viewport[0]||viewport[1]||viewport[2]!==engine.width||viewport[3]!==engine.height
if(clear_all){need_scissor=false}}else{engine.setViewport([0,0,width,height])
need_scissor=width!==engine.width}if(need_scissor){gl.enable(gl.SCISSOR_TEST)
if(viewport){gl.scissor(viewport[0],viewport[1],viewport[2],viewport[3])}else{gl.scissor(0,0,width,height)}}else{gl.disable(gl.SCISSOR_TEST)}if(clear&&!clear_all){gl.clear(gl.COLOR_BUFFER_BIT|(need_depth?gl.DEPTH_BUFFER_BIT:0))}}function framebufferEnd(opts){assert(cur_tex)
opts=opts||{}
var _opts=opts,filter_linear=_opts.filter_linear,wrap=_opts.wrap,need_depth=_opts.need_depth
assert.equal(Boolean(cur_depth),need_depth==="texture")
cur_tex.captureEnd(filter_linear,wrap)
var ret
if(cur_depth){ret=[cur_tex,cur_depth]}else{ret=cur_tex}cur_tex=null
cur_depth=null
return ret}function framebufferTopOfFrame(){cur_tex=null
cur_depth=null}function framebufferEndOfFrame(){assert(!cur_tex)
last_num_passes=num_passes
num_passes=0
skip_release=skip_release&&!reset_fbos
for(var key in temporary_textures){var temp=temporary_textures[key]
if(reset_fbos){temp.idx=0}if(!skip_release){while(temp.list.length>temp.idx){temp.list.pop().destroy()}}if(!temp.list.length){delete temporary_textures[key]}else{temp.idx=0}}for(var _key in temporary_depthbuffers){var _temp=temporary_depthbuffers[_key]
if(reset_fbos){_temp.idx=0}if(!skip_release){while(_temp.list.length>_temp.idx){var _temp$list$pop=_temp.list.pop(),depth_buffer=_temp$list$pop.depth_buffer
gl.deleteRenderbuffer(depth_buffer)}}if(!_temp.list.length){delete temporary_depthbuffers[_key]}else{_temp.idx=0}}for(var _key2 in temporary_depthtextures){var _temp2=temporary_depthtextures[_key2]
if(reset_fbos){_temp2.idx=0}if(!skip_release){while(_temp2.list.length>_temp2.idx){var _temp2$list$pop=_temp2.list.pop(),tex=_temp2$list$pop.tex
tex.destroy()}}if(!_temp2.list.length){delete temporary_depthtextures[_key2]}else{_temp2.idx=0}}reset_fbos=false
skip_release=false}function framebufferUpdateCanvasForCapture(){if(cur_tex&&settings.use_fbos){var saved_tex=cur_tex
var saved_viewport=engine.viewport.slice(0)
framebufferEnd()
applyCopy({source:saved_tex,final:true,viewport:saved_viewport})
framebufferStart({force_tex:saved_tex,viewport:saved_viewport})
return saved_tex}else{return{width:engine.viewport[2],height:engine.viewport[3]}}}settings.register({show_passes:{label:"Show Postprocessing Passes",default_value:0,type:cmd_parse.TYPE_INT,range:[0,1]},use_fbos:{label:"Use Framebuffer Objects for postprocessing",default_value:is_ios?1:0,type:cmd_parse.TYPE_INT,range:[0,1],ver:1},fbo_depth16:{label:"Use 16-bit depth buffers for offscreen rendering",default_value:0,type:cmd_parse.TYPE_INT,range:[0,1],on_change:resetFBOs},fbo_rgba:{label:"Use RGBA color buffers for offscreen rendering",default_value:0,type:cmd_parse.TYPE_INT,range:[0,1],on_change:resetFBOs}})
reset_fbos=false
perf.addMetric({name:"passes",show_stat:"show_passes",labels:{"passes: ":function passes(){return last_num_passes.toString()}}})

},{"./browser.js":11,"./cmds.js":16,"./effects.js":19,"./engine.js":20,"./perf.js":46,"./settings.js":55,"./textures.js":67,"assert":undefined}],28:[function(require,module,exports){
"use strict"
exports.TRIANGLE_FAN=exports.TRIANGLES=exports.QUADS=void 0
exports.create=create
exports.createIndices=createIndices
exports.createQuads=createQuads
exports.geomResetState=geomResetState
exports.startup=startup
exports.stats=void 0
var assert=require("assert")
var _require=require("./cmds.js"),cmd_parse=_require.cmd_parse
var engine=require("./engine.js")
var perf=require("./perf.js")
var settings=require("./settings.js")
var _require2=require("./shaders.js"),MAX_SEMANTIC=_require2.MAX_SEMANTIC
var ceil=Math.ceil,max=Math.max,min=Math.min
var TRIANGLES=4
exports.TRIANGLES=TRIANGLES
var TRIANGLE_FAN=6
exports.TRIANGLE_FAN=TRIANGLE_FAN
var QUADS=7
exports.QUADS=QUADS
var MAX_VERT_COUNT=65536-4
settings.register({show_render_stats:{default_value:0,type:cmd_parse.TYPE_INT,range:[0,1]}})
var stats={draw_calls:0,draw_calls_geom:0,draw_calls_sprite:0,tris:0,verts:0,sprites:0,sprite_sort_elems:0,sprite_sort_cmps:0,font_calls:0,font_params:0}
exports.stats=stats
var last_stats={}
var perf_labels={}
var _loop=function _loop(key){perf_labels[key+": "]=function(){return String(last_stats[key])}}
for(var key in stats){_loop(key)}perf.addMetric({name:"render_stats",show_stat:"show_render_stats",show_all:true,labels:perf_labels})
var gl_byte_size={5120:1,5121:1,5122:2,5123:2,5126:4}
var bound_geom
var bound_array_buf=null
var bound_index_buf=null
var quad_index_buf
var quad_index_buf_len=0
function deleteBuffer(handle){if(!handle){return}if(bound_array_buf===handle){gl.bindBuffer(gl.ARRAY_BUFFER,null)
bound_array_buf=null}if(bound_index_buf===handle){gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,null)
bound_index_buf=null}gl.deleteBuffer(handle)}var attrib_enabled=0
function enableVertexAttribArray(bits){if(bits===attrib_enabled){return}var disable_mask=attrib_enabled&~bits
var enable_mask=~attrib_enabled&bits
attrib_enabled=bits
if(disable_mask){var n=0
do{if(disable_mask&1){gl.disableVertexAttribArray(n)}n++
disable_mask>>=1}while(disable_mask)}if(enable_mask){var _n=0
do{if(enable_mask&1){gl.enableVertexAttribArray(_n)}_n++
enable_mask>>=1}while(enable_mask)}}function getQuadIndexBuf(quad_count){assert(quad_count<=MAX_VERT_COUNT/4)
if(quad_count*6>quad_index_buf_len){if(!quad_index_buf){quad_index_buf=gl.createBuffer()}else{engine.perf_state.gpu_mem.geom-=quad_index_buf_len*2}quad_index_buf_len=min(max(ceil(quad_index_buf_len*1.5),quad_count*6),MAX_VERT_COUNT*6/4)
if(bound_index_buf!==quad_index_buf){gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,quad_index_buf)
bound_index_buf=quad_index_buf}var arr=new Uint16Array(quad_index_buf_len)
var vidx=0
for(var ii=0;ii<quad_index_buf_len;){arr[ii++]=vidx+1
arr[ii++]=vidx+3
arr[ii++]=vidx++
arr[ii++]=vidx++
arr[ii++]=vidx++
arr[ii++]=vidx++}gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,arr,gl.STATIC_DRAW)
engine.perf_state.gpu_mem.geom+=quad_index_buf_len*2}return quad_index_buf}function createIndices(idxs){var ret={ibo:gl.createBuffer(),ibo_size:idxs.length}
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ret.ibo)
bound_index_buf=ret.ibo
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,idxs,gl.STATIC_DRAW)
engine.perf_state.gpu_mem.geom+=idxs.length*2
return ret}function formatInfo(format){if(!format.info){var stride=0
var elem_count=0
var used_attribs=0
var common_byte_size=0
for(var ii=0;ii<format.length;++ii){var fmt=format[ii]
var sem=fmt[0]
var gltype=fmt[1]
var count=fmt[2]
used_attribs|=1<<sem
var byte_size=gl_byte_size[gltype]
assert(byte_size)
assert(!common_byte_size||byte_size===common_byte_size)
common_byte_size=byte_size
fmt[3]=fmt[3]||false
fmt[4]=byte_size
stride+=count*byte_size
elem_count+=count}format.info={stride:stride,elem_count:elem_count,used_attribs:used_attribs,common_byte_size:common_byte_size}}return format.info}function Geom(format,verts,idxs,mode){this.mode=mode||TRIANGLES
this.format=format
var info=this.format_info=formatInfo(format)
this.stride=info.stride
this.used_attribs=info.used_attribs
this.vert_count=verts.length/this.format_info.elem_count
this.vert_gpu_mem=verts.length*this.format_info.common_byte_size
if(verts.length){this.vbo=gl.createBuffer()
gl.bindBuffer(gl.ARRAY_BUFFER,this.vbo)
bound_array_buf=this.vbo
gl.bufferData(gl.ARRAY_BUFFER,verts,gl.STATIC_DRAW)
engine.perf_state.gpu_mem.geom+=this.vert_gpu_mem}this.orig_mode=mode
if(idxs){if(idxs.ibo){this.ibo=idxs.ibo
this.ibo_owned=false
this.ibo_size=idxs.ibo_size}else if(idxs.length){this.ibo=gl.createBuffer()
this.ibo_owned=true
this.ibo_size=idxs.length
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.ibo)
bound_index_buf=this.ibo
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,idxs,gl.STATIC_DRAW)
engine.perf_state.gpu_mem.geom+=idxs.length*2}else{this.ibo=null
this.ibo_owned=true
this.ibo_size=0}}else if(mode===QUADS){assert.equal(this.vert_count%4,0)
var quad_count=this.vert_count/4
this.ibo=getQuadIndexBuf(quad_count)
this.ibo_owned=false
this.ibo_size=quad_count*6
this.mode=TRIANGLES}else if(mode===TRIANGLE_FAN){this.mode=TRIANGLE_FAN}else{this.ibo=null
this.ibo_owned=false}this.updateTriCount()}function trianglesFromMode(mode,eff_vert_count){if(mode===TRIANGLES){return eff_vert_count/3}else if(mode===TRIANGLE_FAN){return eff_vert_count-2}else{assert(!eff_vert_count)
return 0}}Geom.prototype.updateTriCount=function(){var eff_vert_count=this.ibo?this.ibo_size:this.vert_count
this.tri_count=trianglesFromMode(this.mode,eff_vert_count)}
Geom.prototype.updateIndex=function(idxs,num_idxs){assert.equal(this.ibo_owned,true)
if(num_idxs>this.ibo_size){if(bound_geom===this){bound_geom=null}engine.perf_state.gpu_mem.geom-=this.ibo_size*2
deleteBuffer(this.ibo)
this.ibo_size=idxs.length
this.ibo=gl.createBuffer()
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.ibo)
bound_index_buf=this.ibo
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,idxs,gl.DYNAMIC_DRAW)
engine.perf_state.gpu_mem.geom+=idxs.length*2}else{if(bound_index_buf!==this.ibo){gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.ibo)
bound_index_buf=this.ibo}gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER,0,idxs.subarray(0,num_idxs))}this.updateTriCount()}
Geom.prototype.updateSub=function(offset,verts){if(bound_array_buf!==this.vbo){gl.bindBuffer(gl.ARRAY_BUFFER,this.vbo)
bound_array_buf=this.vbo}gl.bufferSubData(gl.ARRAY_BUFFER,offset,verts)}
Geom.prototype.update=function(verts,num_verts){if(num_verts>this.vert_count){if(bound_geom===this){bound_geom=null}engine.perf_state.gpu_mem.geom-=this.vert_gpu_mem
deleteBuffer(this.vbo)
this.vert_count=verts.length/this.format_info.elem_count
this.vert_gpu_mem=verts.length*this.format_info.common_byte_size
this.vbo=gl.createBuffer()
gl.bindBuffer(gl.ARRAY_BUFFER,this.vbo)
bound_array_buf=this.vbo
gl.bufferData(gl.ARRAY_BUFFER,verts,gl.DYNAMIC_DRAW)
engine.perf_state.gpu_mem.geom+=this.vert_gpu_mem}else{if(bound_array_buf!==this.vbo){gl.bindBuffer(gl.ARRAY_BUFFER,this.vbo)
bound_array_buf=this.vbo}gl.bufferSubData(gl.ARRAY_BUFFER,0,verts.subarray(0,num_verts*this.format_info.elem_count))}if(this.orig_mode===QUADS){assert.equal(this.ibo_owned,false)
var quad_count=num_verts/4
this.ibo=getQuadIndexBuf(quad_count)
this.ibo_size=quad_count*6}this.updateTriCount()}
Geom.prototype.dispose=function(){if(this.ibo_owned){deleteBuffer(this.ibo)}this.ibo=null
deleteBuffer(this.vbo)
this.vbo=null
engine.perf_state.gpu_mem.geom-=this.vert_gpu_mem
this.vert_gpu_mem=0}
var bound_attribs=function(){var r=[]
for(var ii=0;ii<16;++ii){r.push({vbo:null,offset:0})}return r}()
function geomResetState(){bound_geom=null
bound_index_buf=null
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,null)
bound_array_buf=null
gl.bindBuffer(gl.ARRAY_BUFFER,null)
for(var ii=0;ii<MAX_SEMANTIC;++ii){gl.disableVertexAttribArray(ii)}attrib_enabled=0
for(var _ii=0;_ii<bound_attribs.length;++_ii){bound_attribs[_ii].vbo=null}stats.draw_calls=stats.draw_calls_geom+stats.draw_calls_sprite
for(var _key in stats){last_stats[_key]=stats[_key]
stats[_key]=0}}Geom.prototype.bind=function(){if(bound_geom!==this){bound_geom=this
var vbo=this.vbo
var offset=0
for(var ii=0;ii<this.format.length;++ii){var fmt=this.format[ii]
var count=fmt[2]
var byte_size=fmt[4]
var sem=fmt[0]
if(bound_attribs[sem].vbo===vbo){}else{if(bound_array_buf!==vbo){gl.bindBuffer(gl.ARRAY_BUFFER,vbo)
bound_array_buf=vbo}var gltype=fmt[1]
var normalized=fmt[3]
gl.vertexAttribPointer(sem,count,gltype,normalized,this.stride,offset)
bound_attribs[sem].vbo=bound_array_buf}offset+=count*byte_size}enableVertexAttribArray(this.used_attribs)}if(this.ibo&&bound_index_buf!==this.ibo){gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.ibo)
bound_index_buf=this.ibo}}
Geom.prototype.draw=function(){this.bind();++stats.draw_calls_geom
stats.tris+=this.tri_count
stats.verts+=this.vert_count
if(this.ibo){gl.drawElements(this.mode,this.ibo_size,gl.UNSIGNED_SHORT,0)}else{gl.drawArrays(this.mode,0,this.vert_count)}}
Geom.prototype.drawSub=function(start,tri_count){assert.equal(this.mode,TRIANGLES)
this.bind();++stats.draw_calls_geom
if(this.ibo){stats.tris+=tri_count
stats.verts+=tri_count*2
gl.drawElements(this.mode,tri_count*3,gl.UNSIGNED_SHORT,start*2)}else{gl.drawArrays(this.mode,start,tri_count*3)}}
function GeomMultiQuads(format,verts){var format_info=formatInfo(format)
var ec=format_info.elem_count
var vert_count=verts.length/ec
this.geoms=[]
for(var idx=0;idx<vert_count;idx+=MAX_VERT_COUNT){var num_sub_verts=min(vert_count-idx,MAX_VERT_COUNT)
var sub_data=new Uint8Array(verts.buffer,idx*ec,num_sub_verts*ec)
this.geoms.push(new Geom(format,sub_data,null,QUADS))}}GeomMultiQuads.prototype.draw=function(){for(var ii=0;ii<this.geoms.length;++ii){this.geoms[ii].draw()}}
GeomMultiQuads.prototype.dispose=function(){for(var ii=0;ii<this.geoms.length;++ii){this.geoms[ii].dispose()}this.geoms=null}
function create(format,verts,idxs,mode){return new Geom(format,verts,idxs,mode)}function createQuads(format,verts,fixed_size){var format_info=formatInfo(format)
assert(fixed_size||verts instanceof Uint8Array)
var vert_count=verts.length/format_info.elem_count
if(vert_count>MAX_VERT_COUNT){return new GeomMultiQuads(format,verts)}return new Geom(format,verts,null,QUADS)}function startup(){}

},{"./cmds.js":16,"./engine.js":20,"./perf.js":46,"./settings.js":55,"./shaders.js":57,"assert":undefined}],29:[function(require,module,exports){
"use strict"
exports.decode=decode
var charCache=new Array(128)
var charFromCodePt=String.fromCodePoint||String.fromCharCode
var result=[]
function decode(array){var codePt
var byte1
var buffLen=array.length
result.length=0
for(var i=0;i<buffLen;){byte1=array[i++]
if(byte1<=127){codePt=byte1}else if(byte1<=223){codePt=(byte1&31)<<6|array[i++]&63}else if(byte1<=239){codePt=(byte1&15)<<12|(array[i++]&63)<<6|array[i++]&63}else if(String.fromCodePoint){codePt=(byte1&7)<<18|(array[i++]&63)<<12|(array[i++]&63)<<6|array[i++]&63}else{codePt=63
i+=3}result.push(charCache[codePt]||(charCache[codePt]=charFromCodePt(codePt)))}return result.join("")}

},{}],30:[function(require,module,exports){
"use strict"
exports.ATTRIBUTE_TYPE_TO_COMPONENTS=exports.ATTRIBUTE_COMPONENT_TYPE_TO_BYTE_SIZE=exports.ATTRIBUTE_COMPONENT_TYPE_TO_ARRAY=void 0
exports.getAccessorTypeFromSize=getAccessorTypeFromSize
var TYPES=["SCALAR","VEC2","VEC3","VEC4"]
function getAccessorTypeFromSize(size){var type=TYPES[size-1]
return type||TYPES[0]}var ATTRIBUTE_TYPE_TO_COMPONENTS={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16}
exports.ATTRIBUTE_TYPE_TO_COMPONENTS=ATTRIBUTE_TYPE_TO_COMPONENTS
var ATTRIBUTE_COMPONENT_TYPE_TO_BYTE_SIZE={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}
exports.ATTRIBUTE_COMPONENT_TYPE_TO_BYTE_SIZE=ATTRIBUTE_COMPONENT_TYPE_TO_BYTE_SIZE
var ATTRIBUTE_COMPONENT_TYPE_TO_ARRAY={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array}
exports.ATTRIBUTE_COMPONENT_TYPE_TO_ARRAY=ATTRIBUTE_COMPONENT_TYPE_TO_ARRAY

},{}],31:[function(require,module,exports){
"use strict"
var assert=require("assert")
var _require=require("./unpack-glb-buffers.js"),unpackGLBBuffers=_require.unpackGLBBuffers
var _require2=require("./unpack-binary-json.js"),unpackBinaryJson=_require2.unpackBinaryJson
function padTo4Bytes(byteLength){return byteLength+3&~3}var decode_utf8=require("./decode-utf8.js")
var _require3=require("./gltf-type-utils.js"),ATTRIBUTE_TYPE_TO_COMPONENTS=_require3.ATTRIBUTE_TYPE_TO_COMPONENTS,ATTRIBUTE_COMPONENT_TYPE_TO_BYTE_SIZE=_require3.ATTRIBUTE_COMPONENT_TYPE_TO_BYTE_SIZE,ATTRIBUTE_COMPONENT_TYPE_TO_ARRAY=_require3.ATTRIBUTE_COMPONENT_TYPE_TO_ARRAY
var MAGIC_glTF=1735152710
var GLB_FILE_HEADER_SIZE=12
var GLB_CHUNK_HEADER_SIZE=8
var GLB_CHUNK_TYPE_JSON=1313821514
var GLB_CHUNK_TYPE_BIN=5130562
var LE=true
var BE=false
function GLBParser(){this.binaryByteOffset=null
this.packedJson=null
this.json=null}function parseBinary(self){var dataView=new DataView(self.glbArrayBuffer)
var magic1=dataView.getUint32(0,BE)
var version=dataView.getUint32(4,LE)
var fileLength=dataView.getUint32(8,LE)
var valid=magic1===MAGIC_glTF
if(!valid){console.warn("Invalid GLB magic string")}assert(version===2,"Invalid GLB version "+version+". Only .glb v2 supported")
assert(fileLength>20)
var jsonChunkLength=dataView.getUint32(12,LE)
var jsonChunkFormat=dataView.getUint32(16,LE)
valid=jsonChunkFormat===GLB_CHUNK_TYPE_JSON||jsonChunkFormat===0
assert(valid,"JSON chunk format "+jsonChunkFormat)
var jsonChunkOffset=GLB_FILE_HEADER_SIZE+GLB_CHUNK_HEADER_SIZE
var jsonChunk=new Uint8Array(self.glbArrayBuffer,jsonChunkOffset,jsonChunkLength)
var jsonText=decode_utf8.decode(jsonChunk)
self.json=JSON.parse(jsonText)
var binaryChunkStart=jsonChunkOffset+padTo4Bytes(jsonChunkLength)
self.binaryByteOffset=binaryChunkStart+GLB_CHUNK_HEADER_SIZE
var binChunkFormat=dataView.getUint32(binaryChunkStart+4,LE)
valid=binChunkFormat===GLB_CHUNK_TYPE_BIN||binChunkFormat===1
assert(valid,"BIN chunk format "+binChunkFormat)
return{arrayBuffer:self.glbArrayBuffer,binaryByteOffset:self.binaryByteOffset,json:self.json}}function parseInternal(self){var result=parseBinary(self)
self.packedJson=result.json
self.unpackedBuffers=unpackGLBBuffers(self.glbArrayBuffer,self.json,self.binaryByteOffset)
self.json=unpackBinaryJson(self.json,self.unpackedBuffers)}GLBParser.prototype.parseSync=function(arrayBuffer){this.glbArrayBuffer=arrayBuffer
if(this.json===null&&this.binaryByteOffset===null){parseInternal(this)}return this}
GLBParser.prototype.parse=function(arrayBuffer){return this.parseSync(arrayBuffer)}
GLBParser.prototype.getApplicationData=function(key){return this.json[key]}
GLBParser.prototype.getJSON=function(){return this.json}
GLBParser.prototype.getArrayBuffer=function(){return this.glbArrayBuffer}
GLBParser.prototype.getBinaryByteOffset=function(){return this.binaryByteOffset}
GLBParser.prototype.getBufferView=function(glTFBufferView){var byteOffset=(glTFBufferView.byteOffset||0)+this.binaryByteOffset
return new Uint8Array(this.glbArrayBuffer,byteOffset,glTFBufferView.byteLength)}
GLBParser.prototype.getBuffer=function(glTFAccessor){var ArrayType=ATTRIBUTE_COMPONENT_TYPE_TO_ARRAY[glTFAccessor.componentType]
var components=ATTRIBUTE_TYPE_TO_COMPONENTS[glTFAccessor.type]
var bytesPerComponent=ATTRIBUTE_COMPONENT_TYPE_TO_BYTE_SIZE[glTFAccessor.componentType]
var length=glTFAccessor.count*components
var byteLength=glTFAccessor.count*components*bytesPerComponent
var glTFBufferView=this.json.bufferViews[glTFAccessor.bufferView]
assert(byteLength>=0&&glTFAccessor.byteOffset+byteLength<=glTFBufferView.byteLength)
var byteOffset=glTFBufferView.byteOffset+this.binaryByteOffset+glTFAccessor.byteOffset
return new ArrayType(this.glbArrayBuffer,byteOffset,length)}
GLBParser.prototype.getImageData=function(glTFImage){return{typedArray:this.getBufferView(glTFImage.bufferView),mimeType:glTFImage.mimeType||"image/jpeg"}}
GLBParser.prototype.getImage=function(glTFImage){var arrayBufferView=this.getBufferView(glTFImage.bufferView)
var mimeType=glTFImage.mimeType||"image/jpeg"
var blob=new Blob([arrayBufferView],{type:mimeType})
var urlCreator=window.URL||window.webkitURL
var imageUrl=urlCreator.createObjectURL(blob)
var img=new Image
img.src=imageUrl
return img}
module.exports=GLBParser
GLBParser.parse=function(data){var parser=new GLBParser
return parser.parse(data)}

},{"./decode-utf8.js":29,"./gltf-type-utils.js":30,"./unpack-binary-json.js":32,"./unpack-glb-buffers.js":33,"assert":undefined}],32:[function(require,module,exports){
"use strict"
exports.unpackBinaryJson=unpackBinaryJson
function parseJSONPointer(value){if(typeof value==="string"){if(value.indexOf("##/")===0){return value.slice(1)}var matches=value.match(/#\/([a-z]+)\/([0-9]+)/)
if(matches){var index=parseInt(matches[2],10)
return[matches[1],index]}matches=value.match(/\$\$\$([0-9]+)/)
if(matches){var _index=parseInt(matches[1],10)
return["accessors",_index]}}return null}function decodeJSONPointer(object,buffers){var pointer=parseJSONPointer(object)
if(pointer){var field=pointer[0]
var index=pointer[1]
var buffer=buffers[field]&&buffers[field][index]
if(buffer){return buffer}console.error("Invalid JSON pointer "+object+": #/"+field+"/"+index)}return null}function unpackJsonArraysRecursive(json,topJson,buffers,options){if(options===void 0){options={}}var object=json
var buffer=decodeJSONPointer(object,buffers)
if(buffer){return buffer}if(Array.isArray(object)){return object.map(function(element){return unpackJsonArraysRecursive(element,topJson,buffers,options)})}if(object!==null&&typeof object==="object"){var newObject={}
for(var key in object){newObject[key]=unpackJsonArraysRecursive(object[key],topJson,buffers,options)}return newObject}return object}function unpackBinaryJson(json,buffers,options){if(options===void 0){options={}}return unpackJsonArraysRecursive(json,json,buffers,options)}

},{}],33:[function(require,module,exports){
"use strict"
exports.unpackGLBBuffers=unpackGLBBuffers
var assert=require("assert")
var _require=require("./gltf-type-utils.js"),ATTRIBUTE_TYPE_TO_COMPONENTS=_require.ATTRIBUTE_TYPE_TO_COMPONENTS,ATTRIBUTE_COMPONENT_TYPE_TO_BYTE_SIZE=_require.ATTRIBUTE_COMPONENT_TYPE_TO_BYTE_SIZE,ATTRIBUTE_COMPONENT_TYPE_TO_ARRAY=_require.ATTRIBUTE_COMPONENT_TYPE_TO_ARRAY
function getArrayBufferAtOffset(arrayBuffer,byteOffset){var length=arrayBuffer.byteLength-byteOffset
var binaryBuffer=new ArrayBuffer(length)
var sourceArray=new Uint8Array(arrayBuffer)
var binaryArray=new Uint8Array(binaryBuffer)
for(var i=0;i<length;i++){binaryArray[i]=sourceArray[byteOffset+i]}return binaryBuffer}function getArrayTypeAndLength(accessor,bufferView){var ArrayType=ATTRIBUTE_COMPONENT_TYPE_TO_ARRAY[accessor.componentType]
var components=ATTRIBUTE_TYPE_TO_COMPONENTS[accessor.type]
var bytesPerComponent=ATTRIBUTE_COMPONENT_TYPE_TO_BYTE_SIZE[accessor.componentType]
var length=accessor.count*components
var byteLength=accessor.count*components*bytesPerComponent
assert(byteLength>=0&&byteLength<=bufferView.byteLength)
return{ArrayType:ArrayType,length:length,byteLength:byteLength}}function unpackAccessors(arrayBuffer,bufferViews,json){var accessors=json.accessors||[]
var accessorBuffers=[]
for(var i=0;i<accessors.length;++i){var accessor=accessors[i]
assert(accessor)
var bufferView=bufferViews[accessor.bufferView]
if(bufferView){var _getArrayTypeAndLengt=getArrayTypeAndLength(accessor,bufferView),ArrayType=_getArrayTypeAndLengt.ArrayType,length=_getArrayTypeAndLengt.length
var array=new ArrayType(arrayBuffer,bufferView.byteOffset,length)
array.accessor=accessor
accessorBuffers.push(array)}}return accessorBuffers}function unpackImages(arrayBuffer,bufferViews,json){var images=json.images||[]
var imageBuffers=[]
for(var i=0;i<images.length;++i){var image=images[i]
assert(image)
if(image.bufferView===undefined){imageBuffers.push(null)
continue}var bufferView=bufferViews[image.bufferView]
assert(bufferView)
var array=new Uint8Array(arrayBuffer,bufferView.byteOffset,bufferView.byteLength)
array.imate=image
imageBuffers.push(array)}return imageBuffers}function unpackGLBBuffers(arrayBuffer,json,binaryByteOffset){if(binaryByteOffset){arrayBuffer=getArrayBufferAtOffset(arrayBuffer,binaryByteOffset)}var bufferViews=json.bufferViews||[]
for(var i=0;i<bufferViews.length;++i){var bufferView=bufferViews[i]
assert(bufferView.byteLength>=0)}return{accessors:unpackAccessors(arrayBuffer,bufferViews,json),images:unpackImages(arrayBuffer,bufferViews,json)}}

},{"./gltf-type-utils.js":30,"assert":undefined}],34:[function(require,module,exports){
"use strict"
var max=Math.max,min=Math.min,floor=Math.floor
exports.rgbToHSV=function rgbToHSV(out,rgb){var r=rgb[0]
var g=rgb[1]
var b=rgb[2]
var mn=min(r,g,b)
var mx=max(r,g,b)
out[2]=mx
var delta=mx-mn
if(delta!==0){out[1]=delta/mx}else{out[1]=0
out[0]=0
return}if(r===mx){out[0]=(g-b)/delta}else if(g===mx){out[0]=2+(b-r)/delta}else{out[0]=4+(r-g)/delta}out[0]*=60
if(out[0]<0){out[0]+=360}}
exports.hsvToRGB=function hsvToRGB(out,h,s,v){if(s===0){out[0]=out[1]=out[2]=v
return out}h/=60
if(h>=6){h-=6}var i=floor(h)
var f=h-i
var p=v*(1-s)
var q=v*(1-s*f)
var t=v*(1-s*(1-f))
switch(i){case 0:out[0]=v
out[1]=t
out[2]=p
break
case 1:out[0]=q
out[1]=v
out[2]=p
break
case 2:out[0]=p
out[1]=v
out[2]=t
break
case 3:out[0]=p
out[1]=q
out[2]=v
break
case 4:out[0]=t
out[1]=p
out[2]=v
break
default:out[0]=v
out[1]=p
out[2]=q
break}return out}

},{}],35:[function(require,module,exports){
"use strict"
exports.handle=handle
exports.on=on
exports.topOfFrame=topOfFrame
var assert=require("assert")
var cbs={}
function topOfFrame(){cbs={}}function on(type,code_or_pos,cb){var list=cbs[type]=cbs[type]||[]
if(typeof code_or_pos==="number"){list[code_or_pos]=cb}else{list.push([code_or_pos,cb])}}function handle(type,event){var list=cbs[type]
if(!list){return}switch(type){case"keydown":case"keyup":if(list[event.keyCode]){list[event.keyCode](type,event)}break
case"mouseup":case"mousedown":{var x=event.pageX
var y=event.pageY
var button=event.button
for(var ii=0;ii<list.length;++ii){var elem=list[ii]
var pos=elem[0]
if(x>=pos.x&&x<pos.x+pos.w&&y>=pos.y&&y<pos.y+pos.h&&(pos.button<0||pos.button===button)){elem[1](type,event)
break}}}break
default:assert(false)}}

},{"assert":undefined}],36:[function(require,module,exports){
"use strict"
exports.POINTERLOCK=exports.PAD=exports.KEYS=exports.ANY=void 0
exports.debugGetMouseMoveX=debugGetMouseMoveX
exports.drag=drag
exports.dragDrop=dragDrop
exports.dragOver=dragOver
exports.eatAllInput=eatAllInput
exports.eatAllKeyboardInput=eatAllKeyboardInput
exports.endFrame=endFrame
exports.fakeTouchEvent=fakeTouchEvent
exports.handleTouches=handleTouches
exports.inputEatenMouse=inputEatenMouse
exports.inputLastTime=inputLastTime
exports.inputTouchMode=inputTouchMode
exports.keyDown=keyDown
exports.keyDownEdge=keyDownEdge
exports.keyUpEdge=keyUpEdge
exports.longPress=longPress
exports.mouseButtonHadEdge=mouseButtonHadEdge
exports.mouseButtonHadUpEdge=mouseButtonHadUpEdge
exports.mouseConsumeClicks=mouseConsumeClicks
exports.mouseDomPos=mouseDomPos
exports.mouseDownAnywhere=mouseDownAnywhere
exports.mouseDownEdge=mouseDownEdge
exports.mouseDownMidClick=mouseDownMidClick
exports.mouseDownOverBounds=mouseDownOverBounds
exports.mouseMoved=mouseMoved
exports.mouseOver=mouseOver
exports.mouseOverCaptured=mouseOverCaptured
exports.mousePos=mousePos
exports.mousePosIsTouch=mousePosIsTouch
exports.mouseUpEdge=mouseUpEdge
exports.mouseWheel=mouseWheel
exports.numTouches=numTouches
exports.padButtonDown=padButtonDown
exports.padButtonDownEdge=padButtonDownEdge
exports.padButtonUpEdge=padButtonUpEdge
exports.padGetAxes=padGetAxes
exports.pad_mode=void 0
exports.pointerLockEnter=pointerLockEnter
exports.pointerLockExit=pointerLockExit
exports.pointerLocked=pointerLocked
exports.startup=startup
exports.tickInput=tickInput
exports.tickInputInactive=tickInputInactive
exports.touch_mode=void 0
var assert=require("assert")
var UP_EDGE=0
var UP=0
var DOWN=1
var DOWN_EDGE=2
var TOUCH_AS_MOUSE=true
var map_analog_to_dpad=true
var mouse_log=false
exports.click=mouseUpEdge
exports.inputClick=mouseUpEdge
var _require=require("../common/util.js"),deprecate=_require.deprecate
deprecate(exports,"mouseDown","mouseDownAnywhere, mouseDownMidClick, mouseDownOverBounds")
var ANY=-2
exports.ANY=ANY
var POINTERLOCK=-1
exports.POINTERLOCK=POINTERLOCK
var KEYS={BACKSPACE:8,TAB:9,ENTER:13,RETURN:13,SHIFT:16,CTRL:17,ALT:18,ESC:27,ESCAPE:27,SPACE:32,PAGEUP:33,PAGEDOWN:34,END:35,HOME:36,LEFT:37,UP:38,RIGHT:39,DOWN:40,INS:45,DEL:46,NUMPAD_DIVIDE:111,EQUALS:187,COMMA:188,MINUS:189,PERIOD:190,SLASH:191,TILDE:192}
exports.KEYS=KEYS;(function(){for(var ii=1;ii<=12;++ii){KEYS["F"+ii]=111+ii}for(var _ii=48;_ii<=90;++_ii){KEYS[String.fromCharCode(_ii)]=_ii}})()
if(typeof Proxy==="function"){exports.KEYS=KEYS=new Proxy(KEYS,{get:function get(target,prop){var ret=target[prop]
assert(ret)
return ret}})}var PAD={A:0,SELECT:0,B:1,CANCEL:1,X:2,Y:3,LB:4,LEFT_BUMPER:4,RB:5,RIGHT_BUMPER:5,LT:6,LEFT_TRIGGER:6,RT:7,RIGHT_TRIGGER:7,BACK:8,START:9,LEFT_STICK:10,RIGHT_STICK:11,UP:12,DOWN:13,LEFT:14,RIGHT:15,ANALOG_UP:20,ANALOG_LEFT:21,ANALOG_DOWN:22,ANALOG_RIGHT:23,LSTICK_UP:20,LSTICK_LEFT:21,LSTICK_DOWN:22,LSTICK_RIGHT:23,RSTICK_UP:24,RSTICK_LEFT:25,RSTICK_DOWN:26,RSTICK_RIGHT:27}
exports.PAD=PAD
var _require2=require("./browser.js"),is_firefox=_require2.is_firefox,is_mac_osx=_require2.is_mac_osx
var camera2d=require("./camera2d.js")
var _require3=require("./cmds.js"),cmd_parse=_require3.cmd_parse
var engine=require("./engine.js")
var in_event=require("./in_event.js")
var local_storage=require("./local_storage.js")
var abs=Math.abs,max=Math.max,min=Math.min,sqrt=Math.sqrt
var pointer_lock=require("./pointer_lock.js")
var settings=require("./settings.js")
var _require4=require("./sound.js"),soundResume=_require4.soundResume
var _require5=require("./spot.js"),spotMouseoverHook=_require5.spotMouseoverHook,BUTTON_ANY=_require5.BUTTON_ANY
var _require6=require("../common/util.js"),empty=_require6.empty
var _require7=require("../common/vmath.js"),vec2=_require7.vec2,v2add=_require7.v2add,v2copy=_require7.v2copy,v2lengthSq=_require7.v2lengthSq,v2set=_require7.v2set,v2scale=_require7.v2scale,v2sub=_require7.v2sub
assert.equal(BUTTON_ANY,ANY)
var pad_to_touch
var canvas
var key_state_new={}
var pad_states=[]
var gamepad_data=[]
var mouse_pos=vec2()
var last_mouse_pos=vec2()
var mouse_pos_is_touch=false
var mouse_over_captured=false
var mouse_down=[]
var wheel_events=[]
var movement_questionable_frames=0
var MOVEMENT_QUESTIONABLE_FRAMES=2
var input_eaten_kb=false
var input_eaten_mouse=false
var touches={}
var no_active_touches=true
var touch_mode=local_storage.getJSON("touch_mode",false)
exports.touch_mode=touch_mode
var pad_mode=!touch_mode&&local_storage.getJSON("pad_mode",false)
exports.pad_mode=pad_mode
cmd_parse.registerValue("mouse_log",{type:cmd_parse.TYPE_INT,range:[0,1],get:function get(){return mouse_log},set:function set(v){return mouse_log=v}})
function inputTouchMode(){return touch_mode}function inputEatenMouse(){return input_eaten_mouse}function eventTimestamp(event){if(event&&event.timeStamp){if(event.timeStamp<1e12!==engine.hrtime<1e12){return engine.hrtime}return event.timeStamp}return engine.hrtime}function TouchData(pos,touch,button,event){this.delta=vec2()
this.total=0
this.cur_pos=pos.slice(0)
this.start_pos=pos.slice(0)
this.touch=touch
this.button=button
this.start_time=Date.now()
this.dispatched=false
this.dispatched_drag=false
this.dispatched_drag_over=false
this.was_double_click=false
this.up_edge=0
this.down_edge=0
this.state=DOWN
this.down_time=0
this.origin_time=eventTimestamp(event)}TouchData.prototype.down=function(event,is_edge){if(is_edge){this.down_edge++}this.state=DOWN
this.origin_time=eventTimestamp(event)}
var MIN_EVENT_TIME_DELTA=.01
function timeDelta(event,origin_time){var et=eventTimestamp(event)
return max(et-origin_time,MIN_EVENT_TIME_DELTA)}function KeyData(){this.down_edge=0
this.origin_time=0
this.down_time=0
this.up_edge=0
this.state=UP}KeyData.prototype.keyUp=function(event){++this.up_edge
this.down_time+=timeDelta(event,this.origin_time)
this.state=UP}
function setMouseToMid(){v2set(mouse_pos,engine.width*.5/camera2d.domToCanvasRatio(),engine.height*.5/camera2d.domToCanvasRatio())}function pointerLocked(){return pointer_lock.isLocked()}var pointerlock_touch_id="m"+POINTERLOCK
function pointerLockEnter(when){pointer_lock.enter(when)}function onPointerLockEnter(){if(touch_mode){return}var touch_data=touches[pointerlock_touch_id]
setMouseToMid()
if(touch_data){v2copy(touch_data.start_pos,mouse_pos)
touch_data.state=DOWN
touch_data.origin_time=engine.hrtime}else{touch_data=touches[pointerlock_touch_id]=new TouchData(mouse_pos,false,POINTERLOCK,null)}movement_questionable_frames=MOVEMENT_QUESTIONABLE_FRAMES}function pointerLockExit(){var touch_data=touches[pointerlock_touch_id]
if(touch_data){v2copy(touch_data.cur_pos,mouse_pos)
touch_data.state=UP}pointer_lock.exit()
movement_questionable_frames=MOVEMENT_QUESTIONABLE_FRAMES}var last_event
var skip={isTrusted:1,sourceCapabilities:1,path:1,currentTarget:1,view:1}
function eventlog(event){if(event===last_event){return}last_event=event
var pairs=[]
for(var k in event){var v=event[k]
if(!v||typeof v==="function"||k.toUpperCase()===k||skip[k]){continue}pairs.push(k+":"+(v.id||v))}console.log(engine.frame_index+" "+event.type+" "+(pointerLocked()?"ptrlck":"unlckd")+" "+pairs.join(","))}function letEventThrough(event){return event.target&&(event.target.tagName==="INPUT"||event.target.tagName==="TEXTAREA"||event.target.tagName==="LABEL"||String(event.target.className).includes("noglov"))}function ignored(event){if(!letEventThrough(event)){event.preventDefault()
event.stopPropagation()}}var ctrl_checked=false
var unload_protected=false
function beforeUnload(e){if(unload_protected&&ctrl_checked){pointerLockExit()
e.preventDefault()
e.returnValue="Are you sure you want to quit?"}else{engine.releaseCanvas()}}function protectUnload(enable){unload_protected=enable}var last_input_time=0
function inputLastTime(){return last_input_time}function onUserInput(){soundResume()
last_input_time=Date.now()}function releaseAllKeysDown(evt){for(var code in key_state_new){var ks=key_state_new[code]
if(ks.state===DOWN){ks.keyUp(evt)}}}function onKeyUp(event){protectUnload(event.ctrlKey)
var code=event.keyCode
if(!letEventThrough(event)){event.stopPropagation()
event.preventDefault()}if(code===KEYS.ESC&&pointerLocked()){pointerLockExit()}var ks=key_state_new[code]
if(ks&&ks.state===DOWN){if(is_mac_osx&&event.key==="Meta"){releaseAllKeysDown(event)}else{ks.keyUp(event)}}in_event.handle("keyup",event)}function onKeyDown(event){protectUnload(event.ctrlKey)
var code=event.keyCode
var no_stop=letEventThrough(event)||code>=KEYS.F5&&code<=KEYS.F12||code===KEYS.I&&(event.altKey&&event.metaKey||event.ctrlKey&&event.shiftKey)||code===KEYS.R&&event.ctrlKey
if(!no_stop){event.stopPropagation()
event.preventDefault()}onUserInput()
var ks=key_state_new[code]
if(!ks){ks=key_state_new[code]=new KeyData}if(ks.state!==DOWN){++ks.down_edge
ks.state=DOWN
ks.origin_time=eventTimestamp(event)
in_event.handle("keydown",event)}}var mouse_move_x=0
function debugGetMouseMoveX(){var ret=mouse_move_x
mouse_move_x=0
return ret}var mouse_moved=false
var mouse_button_had_edge=false
var mouse_button_had_up_edge=false
var temp_delta=vec2()
var last_abs_move=0
var last_abs_move_time=0
var last_move_x=0
var last_move_y=0
function onMouseMove(event,no_stop){if(!letEventThrough(event)&&!no_stop&&event.button!==3){event.preventDefault()
event.stopPropagation()
if(touch_mode){local_storage.setJSON("touch_mode",false)
exports.touch_mode=touch_mode=false}if(pad_mode){local_storage.setJSON("pad_mode",false)
exports.pad_mode=pad_mode=false}}mouse_moved=true
mouse_pos[0]=event.pageX
mouse_pos[1]=event.pageY
mouse_pos_is_touch=false
var movement_x=event.movementX||event.mozMovementX||event.webkitMovementX||0
var movement_y=event.movementY||event.mozMovementY||event.webkitMovementY||0
mouse_move_x+=movement_x
var any_movement=false
if(pointerLocked()){setMouseToMid()
if(movement_x||movement_y){var ts=event.timeStamp||Date.now()
var abs_x=abs(movement_x)
var abs_y=abs(movement_y)
var abs_move=abs_x+abs_y
if(abs_move>200&&(abs_move>3*last_abs_move||ts-last_abs_move_time>1e3)){console.log("Ignoring mousemove with sudden large delta: "+movement_x+","+movement_y)}else if(is_firefox&&movement_x===last_move_x&&movement_y===last_move_y&&abs_x<2&&abs_y<2){}else{v2set(temp_delta,movement_x||0,movement_y||0)
any_movement=true}last_abs_move=abs_move
last_abs_move_time=ts
last_move_x=movement_x
last_move_y=movement_y}}else{v2sub(temp_delta,mouse_pos,last_mouse_pos)
if(temp_delta[0]||temp_delta[1]){any_movement=true}v2copy(last_mouse_pos,mouse_pos)}if(any_movement&&movement_questionable_frames&&v2lengthSq(temp_delta)>100*100){any_movement=false}if(any_movement){for(var button=POINTERLOCK;button<mouse_down.length;++button){if(mouse_down[button]||button===POINTERLOCK&&pointerLocked()){var touch_data=touches["m"+button]
if(touch_data){v2add(touch_data.delta,touch_data.delta,temp_delta)
touch_data.total+=abs(temp_delta[0])+abs(temp_delta[1])
v2copy(touch_data.cur_pos,mouse_pos)}}}}}function onMouseDown(event){if(mouse_log){eventlog(event)}onMouseMove(event)
onUserInput()
var no_click=letEventThrough(event)
var button=event.button
mouse_down[button]=true
var touch_id="m"+button
if(touches[touch_id]){v2copy(touches[touch_id].start_pos,mouse_pos)}else{touches[touch_id]=new TouchData(mouse_pos,false,button,event)}touches[touch_id].down(event,!no_click)
if(!no_click){in_event.handle("mousedown",event)}mouse_button_had_edge=true
if(window.focus){window.focus()}}var last_up_edges=[{timestamp:0,pos:vec2()},{timestamp:0,pos:vec2()}]
function registerMouseUpEdge(touch_data,timestamp){touch_data.up_edge++
var t=last_up_edges[0]
last_up_edges[0]=last_up_edges[1]
last_up_edges[1]=t
v2copy(t.pos,touch_data.cur_pos)
t.timestamp=timestamp}function onMouseUp(event){if(mouse_log){eventlog(event)}onMouseMove(event)
var no_click=letEventThrough(event)
var button=event.button
if(mouse_down[button]){var touch_id="m"+button
var touch_data=touches[touch_id]
if(touch_data){v2copy(touch_data.cur_pos,mouse_pos)
if(!no_click){registerMouseUpEdge(touch_data,eventTimestamp(event))}touch_data.state=UP
touch_data.down_time+=timeDelta(event,touch_data.origin_time)}delete mouse_down[button]}mouse_button_had_edge=true
mouse_button_had_up_edge=true
if(!no_click){in_event.handle("mouseup",event)}}function onWheel(event){var saved=mouse_moved
onMouseMove(event,true)
mouse_moved=saved
var delta=-event.deltaY||event.wheelDelta||-event.detail
wheel_events.push({pos:[event.pageX,event.pageY],delta:delta>0?1:-1,dispatched:false})}var touch_pos=vec2()
var released_touch_id=0
function onTouchChange(event){onUserInput()
if(!touch_mode){local_storage.set("touch_mode",true)
exports.touch_mode=touch_mode=true}if(pad_mode){local_storage.set("pad_mode",false)
exports.pad_mode=pad_mode=false}if(event.cancelable!==false){event.preventDefault()}var ct=event.touches
var seen={}
var new_count=ct.length
var old_count=0
for(var ii=0;ii<ct.length;++ii){var touch=ct[ii]
try{if(!isFinite(touch.pageX)||!isFinite(touch.pageY)){--new_count
continue}}catch(e){--new_count
continue}var last_touch=touches[touch.identifier]
v2set(touch_pos,touch.pageX,touch.pageY)
if(!last_touch){last_touch=touches[touch.identifier]=new TouchData(touch_pos,true,0,event)
last_touch.down(event,true)
mouse_button_had_edge=true
in_event.handle("mousedown",touch)}else{++old_count
v2sub(temp_delta,touch_pos,last_touch.cur_pos)
v2add(last_touch.delta,last_touch.delta,temp_delta)
last_touch.total+=abs(temp_delta[0])+abs(temp_delta[1])
v2copy(last_touch.cur_pos,touch_pos)}seen[touch.identifier]=true
if(TOUCH_AS_MOUSE&&new_count===1){v2copy(mouse_pos,touch_pos)
mouse_pos_is_touch=true}}var released_touch
var released_ids=[]
for(var id in touches){if(!seen[id]){var _touch=touches[id]
if(_touch.touch&&_touch.state===DOWN){++old_count
released_touch=_touch
released_ids.push(id)
in_event.handle("mouseup",{pageX:_touch.cur_pos[0],pageY:_touch.cur_pos[1]})
registerMouseUpEdge(_touch,eventTimestamp(event))
mouse_button_had_edge=true
mouse_button_had_up_edge=true
_touch.state=UP
_touch.down_time+=timeDelta(event,_touch.origin_time)
_touch.release=true}}}for(var _ii2=0;_ii2<released_ids.length;++_ii2){var _id=released_ids[_ii2]
var _touch2=touches[_id]
var new_id="r"+ ++released_touch_id
delete touches[_id]
touches[new_id]=_touch2}if(TOUCH_AS_MOUSE){if(old_count===1&&new_count===0){delete mouse_down[0]
v2copy(mouse_pos,released_touch.cur_pos)
mouse_pos_is_touch=true}else if(new_count===1){var _touch3=ct[0]
if(!old_count){mouse_down[0]=true}v2set(mouse_pos,_touch3.pageX,_touch3.pageY)
mouse_pos_is_touch=true}else if(new_count>1){delete mouse_down[0]}}}function onBlurOrFocus(evt){protectUnload(false)
releaseAllKeysDown(evt)}var ANALOG_MAP={}
function genAnalogMap(){if(map_analog_to_dpad){ANALOG_MAP[PAD.LEFT]=[PAD.LSTICK_LEFT,PAD.RSTICK_LEFT]
ANALOG_MAP[PAD.RIGHT]=[PAD.LSTICK_RIGHT,PAD.RSTICK_RIGHT]
ANALOG_MAP[PAD.UP]=[PAD.LSTICK_UP,PAD.RSTICK_UP]
ANALOG_MAP[PAD.DOWN]=[PAD.LSTICK_DOWN,PAD.RSTICK_DOWN]}}var passive_param=false
function handleTouches(elem){elem.addEventListener("touchstart",onTouchChange,passive_param)
elem.addEventListener("touchmove",onTouchChange,passive_param)
elem.addEventListener("touchend",onTouchChange,passive_param)
elem.addEventListener("touchcancel",onTouchChange,passive_param)}function startup(_canvas,params){canvas=_canvas
pointer_lock.startup(canvas,onPointerLockEnter)
if(params.map_analog_to_dpad!==undefined){map_analog_to_dpad=params.map_analog_to_dpad}pad_to_touch=params.pad_to_touch
genAnalogMap()
try{var opts=Object.defineProperty({},"passive",{get:function get(){passive_param={passive:false}
return false}})
window.addEventListener("test",null,opts)
window.removeEventListener("test",null,opts)}catch(e){passive_param=false}window.addEventListener("keydown",onKeyDown,false)
window.addEventListener("keyup",onKeyUp,false)
window.addEventListener("click",ignored,false)
window.addEventListener("contextmenu",ignored,false)
window.addEventListener("mousemove",onMouseMove,false)
window.addEventListener("mousedown",onMouseDown,false)
window.addEventListener("mouseup",onMouseUp,false)
if(window.WheelEvent){window.addEventListener("wheel",onWheel,passive_param)}else{window.addEventListener("DOMMouseScroll",onWheel,false)
window.addEventListener("mousewheel",onWheel,false)}window.addEventListener("blur",onBlurOrFocus,false)
window.addEventListener("focus",onBlurOrFocus,false)
handleTouches(canvas)
window.addEventListener("beforeunload",beforeUnload,false)}var DEADZONE=.26
var DEADZONE_SQ=DEADZONE*DEADZONE
var NUM_STICKS=2
var PAD_THRESHOLD=.35
function getGamepadData(idx){var gpd=gamepad_data[idx]
if(!gpd){gpd=gamepad_data[idx]={id:idx,timestamp:0,sticks:new Array(NUM_STICKS)}
for(var ii=0;ii<NUM_STICKS;++ii){gpd.sticks[ii]=vec2()}pad_states[idx]={}}return gpd}function updatePadState(gpd,ps,b,padcode){if(b&&!ps[padcode]){ps[padcode]=DOWN_EDGE
onUserInput()
if(touch_mode){local_storage.set("touch_mode",false)
exports.touch_mode=touch_mode=false}if(!pad_mode){local_storage.setJSON("pad_mode",true)
exports.pad_mode=pad_mode=true}if(padcode===pad_to_touch){var touch_id="g"+gpd.id
if(touches[touch_id]){setMouseToMid()
v2copy(touches[touch_id].start_pos,mouse_pos)}else{touches[touch_id]=new TouchData(mouse_pos,false,0,null)}touches[touch_id].down(null,true)}}else if(!b&&ps[padcode]){ps[padcode]=UP_EDGE
if(padcode===pad_to_touch){var _touch_id="g"+gpd.id
var touch_data=touches[_touch_id]
if(touch_data){setMouseToMid()
v2copy(touch_data.cur_pos,mouse_pos)
registerMouseUpEdge(touch_data,engine.hrtime)
touch_data.state=UP
touch_data.down_time+=max(engine.hrtime-touch_data.origin_time,MIN_EVENT_TIME_DELTA)}}}}function gamepadUpdate(){var gamepads
try{gamepads=navigator.gamepads||navigator.webkitGamepads||navigator.getGamepads&&navigator.getGamepads()||navigator.webkitGetGamepads&&navigator.webkitGetGamepads()}catch(e){}if(gamepads){var numGamePads=gamepads.length
for(var ii=0;ii<numGamePads;ii++){var gamepad=gamepads[ii]
if(!gamepad){continue}var gpd=getGamepadData(ii)
var ps=pad_states[ii]
if(gpd.timestamp<gamepad.timestamp){var buttons=gamepad.buttons
gpd.timestamp=gamepad.timestamp
var numButtons=buttons.length
for(var n=0;n<numButtons;n++){var value=buttons[n]
if(typeof value==="object"){value=value.value}value=value>.5
updatePadState(gpd,ps,value,n)}}var axes=gamepad.axes
if(axes.length>=NUM_STICKS*2){for(var _n=0;_n<NUM_STICKS;++_n){var pair=gpd.sticks[_n]
v2set(pair,axes[_n*2],-axes[_n*2+1])
var magnitude=v2lengthSq(pair)
if(magnitude>DEADZONE_SQ){magnitude=sqrt(magnitude)
v2scale(pair,pair,1/magnitude)
magnitude=min(magnitude,1)
magnitude=(magnitude-DEADZONE)/(1-DEADZONE)
v2scale(pair,pair,magnitude)}else{v2set(pair,0,0)}if(_n<=1&&pad_to_touch!==undefined){var touch_data=touches["g"+gpd.id]
if(touch_data){v2scale(temp_delta,pair,engine.frame_dt)
v2add(touch_data.delta,touch_data.delta,temp_delta)
touch_data.total+=abs(temp_delta[0])+abs(temp_delta[1])
setMouseToMid()
v2copy(touch_data.cur_pos,mouse_pos)}}}updatePadState(gpd,ps,gpd.sticks[0][0]<-PAD_THRESHOLD,PAD.LSTICK_LEFT)
updatePadState(gpd,ps,gpd.sticks[0][0]>PAD_THRESHOLD,PAD.LSTICK_RIGHT)
updatePadState(gpd,ps,gpd.sticks[0][1]<-PAD_THRESHOLD,PAD.LSTICK_DOWN)
updatePadState(gpd,ps,gpd.sticks[0][1]>PAD_THRESHOLD,PAD.LSTICK_UP)
updatePadState(gpd,ps,gpd.sticks[1][0]<-PAD_THRESHOLD,PAD.RSTICK_LEFT)
updatePadState(gpd,ps,gpd.sticks[1][0]>PAD_THRESHOLD,PAD.RSTICK_RIGHT)
updatePadState(gpd,ps,gpd.sticks[1][1]<-PAD_THRESHOLD,PAD.RSTICK_DOWN)
updatePadState(gpd,ps,gpd.sticks[1][1]>PAD_THRESHOLD,PAD.RSTICK_UP)}}}}function fakeTouchEvent(is_down){var touch_id="faketouch"
var touch_data=touches[touch_id]
if(touch_data&&!is_down){setMouseToMid()
v2copy(touch_data.cur_pos,mouse_pos)
registerMouseUpEdge(touch_data,engine.hrtime)
touch_data.state=UP
touch_data.down_time+=max(engine.hrtime-touch_data.origin_time,MIN_EVENT_TIME_DELTA)}else if(!touch_data&&is_down){setMouseToMid()
touches[touch_id]=new TouchData(mouse_pos,false,0,null)}}function tickInput(){if(movement_questionable_frames){--movement_questionable_frames}var hrtime=engine.hrtime
for(var code in key_state_new){var ks=key_state_new[code]
if(ks.state===DOWN){ks.down_time+=max(hrtime-ks.origin_time,MIN_EVENT_TIME_DELTA)
ks.origin_time=hrtime}}for(var touch_id in touches){var touch_data=touches[touch_id]
if(touch_data.state===DOWN){touch_data.down_time+=max(hrtime-touch_data.origin_time,MIN_EVENT_TIME_DELTA)
touch_data.origin_time=hrtime}}mouse_over_captured=false
gamepadUpdate()
in_event.topOfFrame()
ctrl_checked=false
if(touches[pointerlock_touch_id]&&!pointerLocked()){pointerLockExit()}no_active_touches=empty(touches)}function endFrameTickMap(map){Object.keys(map).forEach(function(keycode){switch(map[keycode]){case DOWN_EDGE:map[keycode]=DOWN
break
case UP_EDGE:delete map[keycode]
break
default:}})}function endFrame(skip_mouse){for(var code in key_state_new){var ks=key_state_new[code]
if(ks.state===UP){key_state_new[code]=null
delete key_state_new[code]}else{ks.up_edge=0
ks.down_edge=0
ks.down_time=0}}pad_states.forEach(endFrameTickMap)
if(!skip_mouse){for(var touch_id in touches){var touch_data=touches[touch_id]
if(touch_data.state===UP){touches[touch_id]=null
delete touches[touch_id]}else{touch_data.delta[0]=touch_data.delta[1]=0
touch_data.dispatched=false
touch_data.dispatched_drag=false
touch_data.dispatched_drag_over=false
if(touch_data.drag_payload_frame===engine.frame_index-2){touch_data.drag_payload=null}touch_data.up_edge=0
touch_data.down_edge=0
touch_data.down_time=0}}wheel_events.length=0
input_eaten_mouse=false
mouse_moved=false
mouse_button_had_edge=false
mouse_button_had_up_edge=false}input_eaten_kb=false}function tickInputInactive(){in_event.topOfFrame()
ctrl_checked=false
endFrame()}function eatAllInput(skip_mouse){endFrame(skip_mouse)
if(!skip_mouse){mouse_over_captured=true
input_eaten_mouse=true}input_eaten_kb=true}function eatAllKeyboardInput(){eatAllInput(true)}function mousePos(dst){dst=dst||vec2()
camera2d.domToVirtual(dst,mouse_pos)
return dst}function mouseDomPos(){return mouse_pos}function mouseMoved(){return mouse_moved}function mouseButtonHadEdge(){return mouse_button_had_edge}function mouseButtonHadUpEdge(){return mouse_button_had_up_edge}var full_screen_pos_param={}
function mousePosParamUnique(param){param=param||full_screen_pos_param
var pos_param=param.mouse_pos_param
if(!pos_param){pos_param=param.mouse_pos_param={}}pos_param.x=param.x===undefined?camera2d.x0Real():param.x
pos_param.y=param.y===undefined?camera2d.y0Real():param.y
pos_param.w=param.w===undefined?camera2d.wReal():param.w
pos_param.h=param.h===undefined?camera2d.hReal():param.h
pos_param.button=param.button===undefined?ANY:param.button
return pos_param}var pos_param_temp={}
function mousePosParam(param){param=param||{}
pos_param_temp.x=param.x===undefined?camera2d.x0Real():param.x
pos_param_temp.y=param.y===undefined?camera2d.y0Real():param.y
pos_param_temp.w=param.w===undefined?camera2d.wReal():param.w
pos_param_temp.h=param.h===undefined?camera2d.hReal():param.h
pos_param_temp.button=param.button===undefined?ANY:param.button
return pos_param_temp}var check_pos=vec2()
function checkPos(pos,param){if(!camera2d.domToVirtual(check_pos,pos)){return false}return check_pos[0]>=param.x&&(param.w===Infinity||check_pos[0]<param.x+param.w)&&check_pos[1]>=param.y&&(param.h===Infinity||check_pos[1]<param.y+param.h)}function wasDoubleClick(pos_param){if(engine.hrtime-last_up_edges[0].timestamp>settings.double_click_time){return false}return checkPos(last_up_edges[0].pos,pos_param)}function mouseWheel(param){if(input_eaten_mouse||!wheel_events.length){return 0}param=param||{}
var pos_param=mousePosParam(param)
var ret=0
for(var ii=0;ii<wheel_events.length;++ii){var data=wheel_events[ii]
if(data.dispatched){continue}if(checkPos(data.pos,pos_param)){ret+=data.delta
data.dispatched=true}}return ret}function mouseOverCaptured(){mouse_over_captured=true}function mouseOver(param){profilerStart("mouseOver")
param=param||{}
var pos_param=mousePosParamUnique(param)
spotMouseoverHook(pos_param,param)
if(mouse_over_captured||pointerLocked()&&!param.allow_pointerlock){profilerStop("mouseOver")
return false}if(!param.peek&&!param.peek_touch){for(var id in touches){var touch=touches[id]
if(checkPos(touch.cur_pos,pos_param)){touch.down_edge=0
touch.up_edge=0
if(!param||!param.drag_target){touch.dispatched=true}}}}var ret=false
if(checkPos(mouse_pos,pos_param)){if(!param.peek&&!param.peek_over){mouse_over_captured=true}ret=true}profilerStop("mouseOver")
return ret}function mouseDownAnywhere(button){if(input_eaten_mouse){return false}if(button===undefined){button=ANY}for(var touch_id in touches){var touch_data=touches[touch_id]
if(touch_data.state!==DOWN||!(button===ANY||button===touch_data.button)){continue}return true}return false}function mouseDownMidClick(param){if(input_eaten_mouse||no_active_touches){return false}param=param||{}
var pos_param=mousePosParam(param)
var button=pos_param.button
var max_click_dist=param.max_dist||50
for(var touch_id in touches){var touch_data=touches[touch_id]
if(touch_data.state!==DOWN||!(button===ANY||button===touch_data.button)||touch_data.total>max_click_dist){continue}if(checkPos(touch_data.cur_pos,pos_param)){return true}}return false}function mouseDownOverBounds(param){if(input_eaten_mouse||no_active_touches){return false}param=param||{}
var pos_param=mousePosParam(param)
var button=pos_param.button
for(var touch_id in touches){var touch_data=touches[touch_id]
if(touch_data.state!==DOWN||!(button===ANY||button===touch_data.button)){continue}if(checkPos(touch_data.cur_pos,pos_param)){return true}}return false}function mousePosIsTouch(){return mouse_pos_is_touch}function numTouches(){return Object.keys(touches).length}function keyDown(keycode){if(keycode===KEYS.CTRL){ctrl_checked=true}if(input_eaten_kb){return 0}var ks=key_state_new[keycode]
if(!ks){return 0}if(ks.state===DOWN){assert(ks.down_time)}return ks.down_time}function keyDownEdge(keycode,opts){if(input_eaten_kb){return 0}if(opts&&opts.in_event_cb){in_event.on("keydown",keycode,opts.in_event_cb)}var ks=key_state_new[keycode]
if(!ks){return 0}var r=ks.down_edge
ks.down_edge=0
return r}function keyUpEdge(keycode,opts){if(input_eaten_kb){return 0}if(opts&&opts.in_event_cb){in_event.on("keyup",keycode,opts.in_event_cb)}var ks=key_state_new[keycode]
if(!ks){return 0}var r=ks.up_edge
ks.up_edge=0
return r}function padGetAxes(out,stickindex,padindex){assert(stickindex>=0&&stickindex<NUM_STICKS)
if(padindex===undefined){var sub=vec2()
v2set(out,0,0)
for(var ii=0;ii<gamepad_data.length;++ii){padGetAxes(sub,stickindex,ii)
v2add(out,out,sub)}return}var sticks=getGamepadData(padindex).sticks
v2copy(out,sticks[stickindex])}function padButtonDownInternal(gpd,ps,padcode){if(ps[padcode]){return engine.frame_dt}return 0}function padButtonDownEdgeInternal(gpd,ps,padcode){if(ps[padcode]===DOWN_EDGE){ps[padcode]=DOWN
return 1}return 0}function padButtonUpEdgeInternal(gpd,ps,padcode){if(ps[padcode]===UP_EDGE){delete ps[padcode]
return 1}return 0}function padButtonShared(fn,padcode,padindex){assert(padcode!==undefined)
var r=0
if(padindex===undefined){for(var ii=0;ii<pad_states.length;++ii){r+=padButtonShared(fn,padcode,ii)}return r}if(input_eaten_mouse){return 0}var gpd=gamepad_data[padindex]
if(!gpd){return 0}var ps=pad_states[padindex]
var am=ANALOG_MAP[padcode]
if(am){for(var _ii3=0;_ii3<am.length;++_ii3){r+=fn(gpd,ps,am[_ii3])||0}}r+=fn(gpd,ps,padcode)
return r}function padButtonDown(padcode,padindex){return padButtonShared(padButtonDownInternal,padcode,padindex)}function padButtonDownEdge(padcode,padindex){return padButtonShared(padButtonDownEdgeInternal,padcode,padindex)}function padButtonUpEdge(padcode,padindex){return padButtonShared(padButtonUpEdgeInternal,padcode,padindex)}var start_pos=vec2()
var cur_pos=vec2()
var delta=vec2()
function mouseUpEdge(param){param=param||{}
if(!param.in_event_cb&&no_active_touches){return null}var pos_param=mousePosParam(param)
var button=pos_param.button
var max_click_dist=param.max_dist||50
var dragged_too_far=false
for(var touch_id in touches){var touch_data=touches[touch_id]
if(touch_data.total>max_click_dist){dragged_too_far=true
continue}if(!touch_data.up_edge){continue}if(touch_data.long_press_dispatched){continue}if(!(button===ANY||button===touch_data.button)){continue}if(checkPos(touch_data.cur_pos,pos_param)){if(!param.peek){touch_data.up_edge=0}return{button:touch_data.button,pos:check_pos.slice(0),start_time:touch_data.start_time,was_double_click:wasDoubleClick(pos_param)}}}if(param.in_event_cb&&!input_eaten_mouse&&!mouse_over_captured&&!dragged_too_far){if(!param.phys){param.phys={}}param.phys.button=typeof param.in_event_button==="number"?param.in_event_button:button
camera2d.virtualToDomPosParam(param.phys,pos_param)
in_event.on("mouseup",param.phys,param.in_event_cb)}return null}function mouseDownEdge(param){param=param||{}
if(!param.in_event_cb&&no_active_touches){return null}var pos_param=mousePosParam(param)
var button=pos_param.button
for(var touch_id in touches){var touch_data=touches[touch_id]
if(!touch_data.down_edge||!(button===ANY||button===touch_data.button)){continue}if(checkPos(touch_data.cur_pos,pos_param)){if(!param.peek){touch_data.down_edge=0}return{button:touch_data.button,pos:check_pos.slice(0),start_time:touch_data.start_time}}}if(param.in_event_cb&&!input_eaten_mouse&&!mouse_over_captured){if(!param.phys){param.phys={}}param.phys.button=button
camera2d.virtualToDomPosParam(param.phys,pos_param)
in_event.on("mousedown",param.phys,param.in_event_cb)}return null}function mouseConsumeClicks(param){if(no_active_touches){return}param=param||{}
var pos_param=mousePosParam(param)
var button=pos_param.button
for(var touch_id in touches){var touch_data=touches[touch_id]
if(!(button===ANY||button===touch_data.button)||touch_data.dispatched_drag){continue}if(checkPos(touch_data.start_pos,pos_param)){touch_data.down_edge=0
touch_data.start_pos[0]=touch_data.start_pos[1]=Infinity
touch_data.total=Infinity}}}function drag(param){if(no_active_touches){return null}param=param||{}
var pos_param=mousePosParam(param)
var button=pos_param.button
var min_dist=param.min_dist||0
for(var touch_id in touches){var touch_data=touches[touch_id]
if(!(button===ANY||button===touch_data.button)||touch_data.dispatched_drag){continue}if(checkPos(touch_data.start_pos,pos_param)){camera2d.domDeltaToVirtual(delta,[touch_data.total/2,touch_data.total/2])
var total=delta[0]+delta[1]
if(total<min_dist){continue}if(!param.peek){touch_data.dispatched_drag=true}var is_down_edge=touch_data.down_edge
if(param.eat_clicks){touch_data.down_edge=touch_data.up_edge=0}if(param.payload){touch_data.drag_payload=param.payload
touch_data.drag_payload_frame=engine.frame_index}camera2d.domToVirtual(start_pos,touch_data.start_pos)
camera2d.domToVirtual(cur_pos,touch_data.cur_pos)
camera2d.domDeltaToVirtual(delta,touch_data.delta)
return{cur_pos:cur_pos,start_pos:start_pos,delta:delta,total:total,button:touch_data.button,touch:touch_data.touch,start_time:touch_data.start_time,is_down_edge:is_down_edge,down_time:touch_data.down_time}}}return null}function longPress(param){if(no_active_touches){return null}param=param||{}
var pos_param=mousePosParam(param)
var button=pos_param.button
var max_dist=param.long_press_max_dist||50
var min_time=param.min_time||500
for(var touch_id in touches){var touch_data=touches[touch_id]
if(!(button===ANY||button===touch_data.button)||touch_data.long_press_dispatched){continue}if(checkPos(touch_data.start_pos,pos_param)){camera2d.domDeltaToVirtual(delta,[touch_data.total/2,touch_data.total/2])
var total=delta[0]+delta[1]
if(total>max_dist){continue}var time=Date.now()-touch_data.start_time
if(time<min_time){continue}if(!param.peek){touch_data.long_press_dispatched=true}var is_down_edge=touch_data.down_edge
if(param.eat_clicks){touch_data.down_edge=touch_data.up_edge=0}camera2d.domToVirtual(start_pos,touch_data.start_pos)
camera2d.domToVirtual(cur_pos,touch_data.cur_pos)
camera2d.domDeltaToVirtual(delta,touch_data.delta)
return{long_press:true,cur_pos:cur_pos,start_pos:start_pos,delta:delta,total:total,button:touch_data.button,touch:touch_data.touch,start_time:touch_data.start_time,is_down_edge:is_down_edge,down_time:touch_data.down_time}}}return null}function dragDrop(param){if(no_active_touches){return null}param=param||{}
var pos_param=mousePosParam(param)
var button=pos_param.button
for(var touch_id in touches){var touch_data=touches[touch_id]
if(!(button===ANY||button===touch_data.button)||touch_data.dispatched||!touch_data.drag_payload){continue}if(!touch_data.up_edge){continue}if(checkPos(touch_data.cur_pos,pos_param)){if(!param.peek){touch_data.dispatched_drag_over=true
touch_data.dispatched_drag=true
touch_data.dispatched=true}return{drag_payload:touch_data.drag_payload}}}return null}function dragOver(param){if(no_active_touches){return null}param=param||{}
var pos_param=mousePosParam(param)
var button=pos_param.button
for(var touch_id in touches){var touch_data=touches[touch_id]
if(!(button===ANY||button===touch_data.button)||touch_data.dispatched_drag_over||!touch_data.drag_payload){continue}if(touch_data.state!==DOWN){continue}if(checkPos(touch_data.cur_pos,pos_param)){if(!param.peek){touch_data.dispatched_drag_over=true}camera2d.domToVirtual(cur_pos,touch_data.cur_pos)
return{cur_pos:cur_pos,drag_payload:touch_data.drag_payload}}}return null}

},{"../common/util.js":89,"../common/vmath.js":91,"./browser.js":11,"./camera2d.js":13,"./cmds.js":16,"./engine.js":20,"./in_event.js":35,"./local_storage.js":38,"./pointer_lock.js":47,"./settings.js":55,"./sound.js":61,"./spot.js":63,"assert":undefined}],37:[function(require,module,exports){
"use strict"
exports.link=link
exports.linkGetDefaultStyle=linkGetDefaultStyle
exports.linkText=linkText
exports.linkTick=linkTick
var assert=require("assert")
var engine=require("./engine.js")
var _require=require("./font.js"),style=_require.style
var camera2d=require("./camera2d.js")
var in_event=require("./in_event.js")
var input=require("./input.js")
var abs=Math.abs
var _require2=require("./ui.js"),uiGetDOMElem=_require2.uiGetDOMElem
var ui=require("./ui.js")
var settings=require("./settings.js")
var _require3=require("./spot.js"),SPOT_DEFAULT_BUTTON=_require3.SPOT_DEFAULT_BUTTON,spot=_require3.spot,spotFocusSteal=_require3.spotFocusSteal,spotKey=_require3.spotKey
var style_link_default=style(null,{color:1346437119,outline_width:1,outline_color:32})
var style_link_hover_default=style(null,{color:65535,outline_width:1,outline_color:32})
function linkGetDefaultStyle(){return style_link_default}var state_cache={}
var good_url=/https?:\/\//
function preventFocus(evt){evt.preventDefault()
if(evt.relatedTarget){evt.relatedTarget.focus()}else{evt.currentTarget.blur()}}function link(param){var x=param.x,y=param.y,w=param.w,h=param.h,url=param.url,internal=param.internal,allow_modal=param.allow_modal
if(!url.match(good_url)){url=document.location.protocol+"//"+url}var key=spotKey(param)
var state=state_cache[key]
if(!state){state=state_cache[key]={clicked:false}}state.frame=engine.frame_index
var rect={x:x,y:y,w:w,h:h}
if(camera2d.clipTestRect(rect)&&!(settings.shader_debug||settings.show_profiler)){var elem=uiGetDOMElem(state.elem,allow_modal)
if(elem!==state.elem){state.elem=elem
if(elem){elem.textContent=""
var a_elem=document.createElement("a")
a_elem.setAttribute("draggable",false)
a_elem.textContent=" "
a_elem.className="glovui_link noglov"
a_elem.setAttribute("target","_blank")
a_elem.setAttribute("href",url)
a_elem.setAttribute("tabindex","-1")
a_elem.addEventListener("focus",preventFocus)
state.url=url
if(internal){var down_x
var down_y
input.handleTouches(a_elem)
a_elem.onmousedown=function(ev){down_x=ev.pageX
down_y=ev.pageY}
a_elem.onclick=function(ev){ev.preventDefault()
if(down_x){var dist=abs(ev.pageX-down_x)+abs(ev.pageY-down_y)
if(dist>50){return}}state.clicked=true
in_event.handle("mouseup",ev)}}elem.appendChild(a_elem)
state.a_elem=a_elem}}if(elem){if(url!==state.url){state.a_elem.setAttribute("href",url)
state.url=url}var pos=camera2d.htmlPos(rect.x,rect.y)
elem.style.left=pos[0]+"%"
elem.style.top=pos[1]+"%"
var size=camera2d.htmlSize(rect.w,rect.h)
elem.style.width=size[0]+"%"
elem.style.height=size[1]+"%"}}var clicked=state.clicked
state.clicked=false
return clicked}function linkText(param){var style_link=param.style_link,style_link_hover=param.style_link_hover,x=param.x,y=param.y,z=param.z,font_size=param.font_size,text=param.text,url=param.url,internal=param.internal
text=text||url
z=z||Z.UI
font_size=font_size||ui.font_height
var w=ui.font.getStringWidth(style_link||style_link_default,font_size,text)
var h=font_size
param.w=w
param.h=h
param.def=SPOT_DEFAULT_BUTTON
var spot_ret=spot(param)
var style_use=spot_ret.focused?style_link_hover||style_link_hover_default:style_link||style_link_default
ui.font.drawSized(style_use,x,y,z,font_size,text)
var underline_w=1
ui.drawLine(x,y+h-underline_w,x+w,y+h-underline_w,z-.5,underline_w,1,style_use.color_vec4)
var clicked=link(param)
if(clicked){spotFocusSteal(param)}if(spot_ret.ret&&!internal){var key=spotKey(param)
var state=state_cache[key]
assert(state)
assert(state.a_elem)
state.a_elem.click()}return clicked||spot_ret.ret}function linkTick(){for(var key in state_cache){var state=state_cache[key]
if(state.frame!==engine.frame_index-1){delete state_cache[key]}}}

},{"./camera2d.js":13,"./engine.js":20,"./font.js":26,"./in_event.js":35,"./input.js":36,"./settings.js":55,"./spot.js":63,"./ui.js":69,"assert":undefined}],38:[function(require,module,exports){
"use strict"
exports.getStoragePrefix=getStoragePrefix
exports.localStorageClearAll=localStorageClearAll
exports.localStorageExportAll=localStorageExportAll
exports.localStorageGet=localStorageGet
exports.localStorageGetJSON=localStorageGetJSON
exports.localStorageImportAll=localStorageImportAll
exports.localStorageSet=localStorageSet
exports.localStorageSetJSON=localStorageSetJSON
exports.setStoragePrefix=setStoragePrefix
var assert=require("assert")
exports.get=localStorageGet
exports.set=localStorageSet
exports.setJSON=localStorageSetJSON
exports.getJSON=localStorageGetJSON
exports.clearAll=localStorageClearAll
var storage_prefix="demo"
var is_set=false
function setStoragePrefix(prefix){if(is_set){return}is_set=true
storage_prefix=prefix}function getStoragePrefix(){assert(is_set)
return storage_prefix}var lsd=function(){try{localStorage.setItem("test","test")
localStorage.removeItem("test")
return localStorage}catch(e){return null}}()
var lsd_overlay={}
function localStorageGet(key){assert(is_set)
key=storage_prefix+"_"+key
var ret=lsd_overlay[key]||lsd&&lsd.getItem(key)
if(ret==="undefined"){ret=undefined}else if(ret===null){ret=undefined}return ret}function localStorageSet(key,value){assert(is_set)
key=storage_prefix+"_"+key
if(value===undefined||value===null){if(lsd){lsd.removeItem(key)}delete lsd_overlay[key]}else{var str=String(value)
lsd_overlay[key]=str
try{if(lsd){lsd.setItem(key,str)}}catch(e){}}}function localStorageSetJSON(key,value){localStorageSet(key,JSON.stringify(value))}function localStorageGetJSON(key,def){var value=localStorageGet(key)
if(value===undefined){return def}try{return JSON.parse(value)}catch(e){}return def}function localStorageClearAll(key_prefix){var prefix=new RegExp("^"+storage_prefix+"_"+(key_prefix||""),"u")
if(lsd){var keysToRemove=[]
for(var i=0;i<lsd.length;i++){var key=lsd.key(i)
assert(key)
if(key.match(prefix)){keysToRemove.push(key)}}for(var _i=0;_i<keysToRemove.length;_i++){lsd.removeItem(keysToRemove[_i])}}for(var _key in lsd_overlay){if(_key.match(prefix)){delete lsd_overlay[_key]}}}function localStorageExportAll(){var obj={}
var prefix=new RegExp("^"+storage_prefix+"_(.*)","u")
if(lsd){for(var i=0;i<lsd.length;i++){var key=lsd.key(i)
assert(key)
var m=key.match(prefix)
if(m){var v=lsd.getItem(key)
if(v!=="undefined"){obj[m[1]]=v}}}}for(var _key2 in lsd_overlay){var _m=_key2.match(prefix)
if(_m){obj[_m[1]]=lsd_overlay[_key2]}}return JSON.stringify(obj)}function localStorageImportAll(serialized){var obj=JSON.parse(serialized)
localStorageClearAll()
for(var key in obj){localStorageSet(key,obj[key])}}

},{"assert":undefined}],39:[function(require,module,exports){
"use strict"
exports.getStringFromLocalizable=getStringFromLocalizable
exports.getStringIfLocalizable=getStringIfLocalizable
function getStringFromLocalizable(s){return s&&s.toLocalString?s.toLocalString():s}function getStringIfLocalizable(s){return s&&s.toLocalString?s.toLocalString():s}

},{}],40:[function(require,module,exports){
"use strict"
exports.m43identity=m43identity
exports.m43mul=m43mul
exports.mat43=mat43
function mat43(){var r=new Float32Array(12)
r[0]=r[4]=r[8]=1
return r}function m43identity(out){out[0]=1
out[1]=0
out[2]=0
out[3]=0
out[4]=1
out[5]=0
out[6]=0
out[7]=0
out[8]=1
out[9]=0
out[10]=0
out[11]=0}function m43mul(out,a,b){var a0=a[0]
var a1=a[1]
var a2=a[2]
var a3=a[3]
var a4=a[4]
var a5=a[5]
var a6=a[6]
var a7=a[7]
var a8=a[8]
var a9=a[9]
var a10=a[10]
var a11=a[11]
var b0=b[0]
var b1=b[1]
var b2=b[2]
var b3=b[3]
var b4=b[4]
var b5=b[5]
var b6=b[6]
var b7=b[7]
var b8=b[8]
out[0]=b0*a0+b3*a1+b6*a2
out[1]=b1*a0+b4*a1+b7*a2
out[2]=b2*a0+b5*a1+b8*a2
out[3]=b0*a3+b3*a4+b6*a5
out[4]=b1*a3+b4*a4+b7*a5
out[5]=b2*a3+b5*a4+b8*a5
out[6]=b0*a6+b3*a7+b6*a8
out[7]=b1*a6+b4*a7+b7*a8
out[8]=b2*a6+b5*a7+b8*a8
out[9]=b0*a9+b3*a10+b6*a11+b[9]
out[10]=b1*a9+b4*a10+b7*a11+b[10]
out[11]=b2*a9+b5*a10+b8*a11+b[11]
return out}

},{}],41:[function(require,module,exports){
"use strict"
module.exports=function(out,uniform_scale,quat,pos){var x=quat[0]
var y=quat[1]
var z=quat[2]
var w=quat[3]
var x2=x+x
var y2=y+y
var z2=z+z
var xx=x*x2
var xy=x*y2
var xz=x*z2
var yy=y*y2
var yz=y*z2
var zz=z*z2
var wx=w*x2
var wy=w*y2
var wz=w*z2
out[0]=(1-(yy+zz))*uniform_scale
out[1]=(xy+wz)*uniform_scale
out[2]=(xz-wy)*uniform_scale
out[3]=0
out[4]=(xy-wz)*uniform_scale
out[5]=(1-(xx+zz))*uniform_scale
out[6]=(yz+wx)*uniform_scale
out[7]=0
out[8]=(xz+wy)*uniform_scale
out[9]=(yz-wx)*uniform_scale
out[10]=(1-(xx+yy))*uniform_scale
out[11]=0
out[12]=pos[0]
out[13]=pos[1]
out[14]=pos[2]
out[15]=1
return out}

},{}],42:[function(require,module,exports){
"use strict"
exports.default_vshader=exports.default_fshader=void 0
exports.load=load
exports.models=exports.load_count=void 0
exports.startup=startup
var assert=require("assert")
var geom=require("./geom.js")
var glb_parser=require("./glb/parser.js")
var _require=require("./glb/gltf-type-utils.js"),ATTRIBUTE_TYPE_TO_COMPONENTS=_require.ATTRIBUTE_TYPE_TO_COMPONENTS
var renderer=require("./engine.js")
var _require2=require("./fetch.js"),fetch=_require2.fetch
var shaders=require("./shaders.js")
var textures=require("./textures.js")
var _require3=require("../common/vmath.js"),vec4=_require3.vec4
var _require4=require("./webfs.js"),webFSGetFile=_require4.webFSGetFile
var load_count=0
exports.load_count=load_count
var models={}
exports.models=models
var default_vshader
exports.default_vshader=default_vshader
var default_fshader
exports.default_fshader=default_fshader
function initShaders(){exports.default_vshader=default_vshader=shaders.create("shaders/default.vp")
exports.default_fshader=default_fshader=shaders.create("shaders/default.fp")
shaders.prelink(default_vshader,default_fshader)}function Model(url){this.url=url
var idx=url.lastIndexOf("/")
if(idx!==-1){this.base_url=url.slice(0,idx+1)}else{this.base_url=""}}Model.prototype.load=function(){var _this=this
exports.load_count=++load_count
fetch({url:this.url,response_type:"arraybuffer"},function(err,array_buffer){exports.load_count=--load_count
if(err){window.onerror("Model loading error","models.js",0,0,err)}else{try{_this.parse(array_buffer)}catch(e){window.onerror("Model loading error","models.js",0,0,e)}}})}
var skip_attr={TANGENT:true}
Model.prototype.parse=function(glb_data){var glb=glb_parser.parse(glb_data)
if(!glb){return}var glb_json=glb.getJSON()
var objs=[]
for(var ii=0;ii<glb_json.meshes.length;++ii){var mesh=glb_json.meshes[ii]
for(var jj=0;jj<mesh.primitives.length;++jj){var primitives=mesh.primitives[jj]
var material=glb_json.materials[primitives.material]
var texture=null
if(material){var bct=(material.pbrMetallicRoughness||{}).baseColorTexture||{}
var texture_def=glb_json.textures&&glb_json.textures[bct.index]||{}
var sampler_def=glb_json.samplers&&glb_json.samplers[texture_def.sampler]||{}
var image=glb_json.images&&glb_json.images[texture_def.source]||{}
if(image.uri){var params={url:""+this.base_url+image.uri,filter_mag:sampler_def.magFilter,filter_min:sampler_def.minFilter,wrap_s:sampler_def.wrapS,wrap_t:sampler_def.wrapT}
texture=textures.load(params)}}var format=[]
var buffers=[]
var bidx=[]
var total_size=0
var vert_count=0
for(var attr in primitives.attributes){if(skip_attr[attr]){continue}assert(shaders.semantic[attr]!==undefined)
var _accessor=glb_json.accessors[primitives.attributes[attr]]
assert.equal(_accessor.componentType,5126)
var geom_format=gl.FLOAT
var geom_count=ATTRIBUTE_TYPE_TO_COMPONENTS[_accessor.type]
assert(geom_count)
var my_vert_count=_accessor.count
if(!vert_count){vert_count=my_vert_count}else{assert.equal(vert_count,my_vert_count)}format.push([shaders.semantic[attr],geom_format,geom_count])
var buffer=glb.getBuffer(_accessor)
buffers.push(buffer)
bidx.push(0)
total_size+=buffer.length}var verts=new Float32Array(total_size)
var idx=0
for(var vert=0;vert<vert_count;++vert){for(var _attr=0;_attr<format.length;++_attr){for(var kk=0;kk<format[_attr][2];++kk){verts[idx++]=buffers[_attr][bidx[_attr]++]}}}var accessor=glb_json.accessors[primitives.indices]
assert(accessor)
assert.equal(accessor.type,"SCALAR")
var idxs=glb.getBuffer(accessor)
if(accessor.componentType===5125){assert(vert_count<65535)
idxs=new Uint16Array(idxs)}else{assert.equal(accessor.componentType,5123)}objs.push({geom:geom.create(format,verts,idxs,primitives.mode),texture:texture})}}this.data={objs:objs}}
Model.prototype.draw=function(mat){renderer.updateMatrices(mat)
shaders.bind(default_vshader,default_fshader,{color:vec4(1,1,1,1)})
var objs=this.data.objs
for(var ii=0;ii<objs.length;++ii){var obj=objs[ii]
if(obj.texture){textures.bind(0,obj.texture)}obj.geom.draw()}}
Model.prototype.drawGeom=function(){var objs=this.data.objs
for(var ii=0;ii<objs.length;++ii){var obj=objs[ii]
obj.geom.draw()}}
function load(url){if(models[url]){return models[url]}var model=models[url]=new Model(url)
model.data=models.box.data
model.load()
return model}function startup(){initShaders()
var model_box=models.box=new Model("box")
model_box.parse(webFSGetFile("models/box_textured_embed.glb").buffer)}

},{"../common/vmath.js":91,"./engine.js":20,"./fetch.js":24,"./geom.js":28,"./glb/gltf-type-utils.js":30,"./glb/parser.js":31,"./shaders.js":57,"./textures.js":67,"./webfs.js":73,"assert":undefined}],43:[function(require,module,exports){
"use strict"
exports.buildString=buildString
exports.init=init
exports.netClient=netClient
exports.netClientId=netClientId
exports.netDisconnected=netDisconnected
exports.netForceDisconnect=netForceDisconnect
exports.netSubs=netSubs
exports.netUserId=netUserId
exports.netBuildString=buildString
exports.netInit=init
var _require=require("./filewatch.js"),filewatchStartup=_require.filewatchStartup
var packet=require("../common/packet.js")
var subscription_manager=require("./subscription_manager.js")
var wsclient=require("./wsclient.js")
var wscommon=require("../common/wscommon.js")
var WSClient=wsclient.WSClient
var client
var subs
function init(params){params=params||{}
if(params.ver){wsclient.CURRENT_VERSION=params.ver}if(String(document.location).match(/^https?:\/\/localhost/)){console.log("PacketDebug: ON")
packet.default_flags|=packet.PACKET_DEBUG
if(!params.no_net_delay){wscommon.netDelaySet()}}client=new WSClient(params.path)
subs=subscription_manager.create(client,params.cmd_parse)
subs.auto_create_user=Boolean(params.auto_create_user)
subs.no_auto_login=Boolean(params.no_auto_login)
subs.allow_anon=Boolean(params.allow_anon)
window.subs=subs
exports.subs=subs
exports.client=client
filewatchStartup(client)
if(params.engine){params.engine.addTickFunc(function(dt){client.checkDisconnect()
subs.tick(dt)})}}var build_timestamp_string=new Date(Number("1659041116850")).toISOString().replace("T"," ").slice(5,-8)
function buildString(){return wsclient.CURRENT_VERSION?wsclient.CURRENT_VERSION+" ("+build_timestamp_string+")":build_timestamp_string}function netDisconnected(){return!client||!client.connected||client.disconnected||subs.logging_in||!client.socket||client.socket.readyState!==1}function netForceDisconnect(){var _client,_client$socket
if(subs){subs.was_logged_in=false}(_client=client)==null?void 0:(_client$socket=_client.socket)==null?void 0:_client$socket.close==null?void 0:_client$socket.close()}function netClient(){return client}function netClientId(){return client.id}function netUserId(){return subs.getUserId()}function netSubs(){return subs}

},{"../common/packet.js":85,"../common/wscommon.js":93,"./filewatch.js":25,"./subscription_manager.js":66,"./wsclient.js":75}],44:[function(require,module,exports){
"use strict"
exports.create=create
exports.createScalarInterpolator=createScalarInterpolator
var _require=require("./cmds.js"),cmd_parse=_require.cmd_parse
var glov_engine=require("./engine.js")
var net=require("./net.js")
var netDisconnected=net.netDisconnected
var perf=require("./perf.js")
var settings=require("./settings.js")
var util=require("../common/util.js")
var _require2=require("../common/wscommon.js"),wsstats=_require2.wsstats,wsstats_out=_require2.wsstats_out
var abs=Math.abs,floor=Math.floor,max=Math.max,min=Math.min,PI=Math.PI,sqrt=Math.sqrt
var TWO_PI=PI*2
var EPSILON=.01
var the
settings.register({show_ping:{default_value:0,type:cmd_parse.TYPE_INT,range:[0,1]}})
perf.addMetric({name:"ping",show_stat:"show_ping",labels:{"ping: ":function ping(){if(!the){return""}var pt=the.getPing(2e3)
if(!pt||pt.fade<.001){return""}return{value:""+pt.ping.toFixed(1),alpha:min(1,pt.fade*3)}}}})
settings.register({show_net:{default_value:0,type:cmd_parse.TYPE_INT,range:[0,2]}})
var last_wsstats={msgs:0,bytes:0,time:Date.now(),dm:0,db:0}
var last_wsstats_out={msgs:0,bytes:0,time:Date.now(),dm:0,db:0}
function bandwidth(stats,last){var now=Date.now()
if(now-last.time>1e3){last.dm=stats.msgs-last.msgs
last.db=stats.bytes-last.bytes
last.msgs=stats.msgs
last.bytes=stats.bytes
if(now-last.time>2e3){last.time=now}else{last.time+=1e3}}return(last.db/1024).toFixed(2)+" kb ("+last.dm+")"}perf.addMetric({name:"net",show_stat:"show_net",width:5,labels:{"down: ":bandwidth.bind(null,wsstats,last_wsstats),"up: ":bandwidth.bind(null,wsstats_out,last_wsstats_out)}})
var valid_options=["dim_pos","dim_rot","send_time","window","snap_factor","smooth_windows","smooth_factor","default_pos","on_pos_update","on_state_update"]
function NetPositionManager(options){this.on_channel_data=this.onChannelData.bind(this)
this.on_subscribe=this.onChannelSubscribe.bind(this)
this.reinit(options)}NetPositionManager.prototype.deinit=function(){if(this.channel){this.channel.removeListener("channel_data",this.on_channel_data)
this.channel.removeListener("subscribe",this.on_subscribe)}}
NetPositionManager.prototype.onChannelSubscribe=function(data){this.last_send.sending=false
this.last_send.time=0
this.client_id=net.client.id}
NetPositionManager.prototype.onChannelData=function(data,mod_key,mod_value){if(mod_key){var m=mod_key.match(/^public\.clients\.([^.]+)\.(.+)$/)
if(m){var client_id=m[1]
var field=m[2]
if(field==="pos"){this.otherClientPosChanged(client_id)}if(this.on_client_change){var pcd=this.per_client_data[client_id]
if(pcd){this.on_client_change(pcd,field)}}}if(!mod_value){m=mod_key.match(/^public\.clients\.([^.]+)$/)
if(m){delete this.per_client_data[m[1]]}}}else{if(data&&data.public&&data.public.clients){for(var _client_id in data.public.clients){var client_data=data.public.clients[_client_id]
if(client_data.pos){this.otherClientPosChanged(_client_id)}}}}}
NetPositionManager.prototype.vec=function(fill){var r=new Float64Array(this.n)
if(fill){for(var ii=0;ii<this.n;++ii){r[ii]=fill}}return r}
NetPositionManager.prototype.vcopy=function(dst,src){for(var ii=0;ii<this.n;++ii){dst[ii]=src[ii]}return dst}
NetPositionManager.prototype.arr=function(vec){var arr=new Array(this.n)
for(var ii=0;ii<this.n;++ii){arr[ii]=vec[ii]}return arr}
NetPositionManager.prototype.vsame=function(a,b){for(var ii=0;ii<this.n;++ii){if(abs(a[ii]-b[ii])>EPSILON){return false}}return true}
NetPositionManager.prototype.vlength=function(a){var r=0
for(var ii=0;ii<this.n;++ii){var d=a[ii]
r+=d*d}return sqrt(r)}
NetPositionManager.prototype.vdist=function(a,b){this.vsub(this.temp_vec,a,b)
for(var ii=0;ii<this.dim_rot;++ii){var jj=this.dim_pos+ii
var d=abs(this.temp_vec[jj])
if(d>PI){this.temp_vec[jj]=d-floor((d+PI)/TWO_PI)*TWO_PI}}return this.vlength(this.temp_vec)}
NetPositionManager.prototype.vsub=function(dst,a,b){for(var ii=0;ii<this.n;++ii){dst[ii]=a[ii]-b[ii]}return dst}
NetPositionManager.prototype.vscale=function(dst,a,scalar){for(var ii=0;ii<this.n;++ii){dst[ii]=a[ii]*scalar}}
NetPositionManager.prototype.reinit=function(options){this.deinit()
the=this
options=options||{}
this.per_client_data={}
for(var ii=0;ii<valid_options.length;++ii){var field=valid_options[ii]
if(options[field]){this[field]=options[field]}}this.n=this.dim_pos+this.dim_rot
if(!this.default_pos){this.default_pos=this.vec()}if(!this.temp_vec){this.temp_vec=this.vec()}if(!this.temp_delta){this.temp_delta=this.vec()}this.channel=options.channel
this.last_send={pos:this.vec(-1),sending:false,send_time:0}
this.sends_to_ignore=0
this.ever_received_character=false
this.on_client_change=options.on_client_change
if(this.channel){this.channel.on("channel_data",this.on_channel_data)
this.channel.onSubscribe(this.on_subscribe)}}
NetPositionManager.prototype.onPositionUpdate=function(cb){this.on_pos_update=cb}
NetPositionManager.prototype.onStateUpdate=function(cb){this.on_state_update=cb}
function syncPosWithCaller(npm,on_pos_set_cb){npm.vcopy(npm.last_send.pos,npm.default_pos)
var new_pos=on_pos_set_cb(npm.last_send.pos)
if(new_pos){npm.vcopy(npm.last_send.pos,new_pos)}}NetPositionManager.prototype.checkNet=function(on_pos_set_cb){if(netDisconnected()||!this.channel||!this.channel.data.public){return true}if(net.client.id!==this.client_id){return true}var me=this.channel.getChannelData("public.clients."+this.client_id,{})
if(!me.pos||!me.pos.cur||typeof me.pos.cur[0]!=="number"){if(this.ever_received_character){}else{syncPosWithCaller(this,on_pos_set_cb)}this.channel.setChannelData("public.clients."+this.client_id+".pos",{cur:this.arr(this.last_send.pos)})
this.ever_received_character=true}else if(!this.ever_received_character){syncPosWithCaller(this,on_pos_set_cb)
this.ever_received_character=true}return false}
NetPositionManager.prototype.updateMyPos=function(character_pos,anim_state,force){var _this=this
if(!this.vsame(character_pos,this.last_send.pos)||anim_state!==this.last_send.anim_state){var now=glov_engine.getFrameTimestamp()
if(!this.last_send.sending&&(!this.last_send.time||now-this.last_send.time>this.send_time)||force){if(this.last_send.sending){++this.sends_to_ignore}else{this.last_send.sending=true}this.last_send.time=now
this.last_send.hrtime=glov_engine.hrnow()
this.last_send.speed=0
if(this.last_send.send_time){var time=now-this.last_send.send_time
this.last_send.speed=this.vdist(this.last_send.pos,character_pos)/time
if(this.last_send.speed<.001){this.last_send.speed=0}}this.last_send.send_time=now
this.vcopy(this.last_send.pos,character_pos)
this.last_send.anim_state=anim_state
this.channel.setChannelData("public.clients."+this.client_id+".pos",{cur:this.arr(this.last_send.pos),state:this.last_send.anim_state,speed:this.last_send.speed,q:1},false,function(){if(!_this.sends_to_ignore){_this.last_send.sending=false
var end=glov_engine.getFrameTimestamp()
var hrend=glov_engine.hrnow()
var round_trip=hrend-_this.last_send.hrtime
_this.ping_time=round_trip
_this.ping_time_time=end
if(round_trip>_this.send_time){_this.last_send.time=end}}else{--_this.sends_to_ignore}})}}}
NetPositionManager.prototype.getPing=function(max_age){if(!this.ping_time_time){return null}var age=glov_engine.getFrameTimestamp()-this.ping_time_time
if(age>max_age){return null}return{ping:this.ping_time,fade:1-age/max_age}}
NetPositionManager.prototype.getPos=function(client_id){var pcd=this.per_client_data[client_id]
if(!pcd){return null}return pcd.pos}
NetPositionManager.prototype.getPCD=function(client_id){return this.per_client_data[client_id]}
NetPositionManager.prototype.otherClientPosChanged=function(client_id){var client_pos=this.channel.getChannelData("public.clients."+client_id+".pos")
if(!client_pos||!client_pos.cur||typeof client_pos.cur[0]!=="number"){return}var pcd=this.per_client_data[client_id]
if(!pcd){pcd=this.per_client_data[client_id]={}
pcd.pos=this.vcopy(this.vec(),client_pos.cur)
pcd.net_speed=0
pcd.net_pos=this.vec()
pcd.impulse=this.vec()
pcd.net_state="idle_down"
pcd.anim_state="idle_down"}if(client_pos.state){pcd.net_state=client_pos.state}this.vcopy(pcd.net_pos,client_pos.cur)
pcd.net_speed=client_pos.speed
for(var ii=0;ii<this.dim_rot;++ii){var jj=this.dim_pos+ii
while(pcd.pos[jj]>pcd.net_pos[jj]+PI){pcd.pos[jj]-=TWO_PI}while(pcd.pos[jj]<pcd.net_pos[jj]-PI){pcd.pos[jj]+=TWO_PI}}var delta=this.vsub(this.temp_delta,pcd.net_pos,pcd.pos)
var dist=this.vlength(delta)
if(dist>0){var time_to_dest=dist/pcd.net_speed
if(time_to_dest<this.send_time+this.window){this.vscale(pcd.impulse,delta,pcd.net_speed/dist)}else if(time_to_dest<this.send_time+this.window*this.smooth_windows){var old_speed=this.vlength(pcd.impulse)
var specified_speed=pcd.net_speed
var new_speed=max(specified_speed*this.smooth_factor,old_speed)
this.vscale(pcd.impulse,delta,new_speed/dist)}else{this.vscale(pcd.impulse,delta,1/(this.send_time+this.window*this.snap_factor))}}}
NetPositionManager.prototype.updateOtherClient=function(client_id,dt){var pcd=this.per_client_data[client_id]
if(!pcd){return null}var stopped=true
for(var ii=0;ii<this.n;++ii){if(pcd.impulse[ii]){var delta_old=pcd.net_pos[ii]-pcd.pos[ii]
var delta_old_sign=util.sign(delta_old)
pcd.pos[ii]+=pcd.impulse[ii]*dt
var delta_new=pcd.net_pos[ii]-pcd.pos[ii]
var delta_new_sign=util.sign(delta_new)
if(delta_new_sign!==delta_old_sign){pcd.pos[ii]=pcd.net_pos[ii]
pcd.impulse[ii]=0}else if(ii<this.dim_pos&&pcd.impulse[ii]>.01){stopped=false}}}if(this.on_pos_update){this.on_pos_update(client_id,pcd.pos)}var cur_is_run=pcd.anim_state[0]==="f"||pcd.anim_state[0]==="w"
var new_is_idle=pcd.net_state[0]==="i"
if(cur_is_run&&new_is_idle&&!stopped){}else{pcd.anim_state=pcd.net_state
if(this.on_state_update){this.on_state_update(client_id,pcd.net_state)}}return pcd}
NetPositionManager.prototype.dim_pos=2
NetPositionManager.prototype.dim_rot=0
NetPositionManager.prototype.send_time=200
NetPositionManager.prototype.window=200
NetPositionManager.prototype.snap_factor=1
NetPositionManager.prototype.smooth_windows=6.5
NetPositionManager.prototype.smooth_factor=1.2
function create(options){return new NetPositionManager(options)}function ScalarInterpolator(tick_time){this.tick_time=tick_time*1.25
this.reset()}ScalarInterpolator.prototype.reset=function(){this.value=undefined
this.target_value=undefined
this.vel=0}
ScalarInterpolator.prototype.update=function(dt,new_value){if(this.value===undefined){this.value=new_value
this.target_value=new_value
return}if(new_value!==this.target_value){this.vel=(new_value-this.value)/this.tick_time
this.target_value=new_value}if(this.value!==this.target_value){if(this.vel>0){this.value=min(this.value+this.vel*dt,this.target_value)}else{this.value=max(this.value+this.vel*dt,this.target_value)}}}
ScalarInterpolator.prototype.getValue=function(){return this.value}
function createScalarInterpolator(tick_time){return new ScalarInterpolator(tick_time)}

},{"../common/util.js":89,"../common/wscommon.js":93,"./cmds.js":16,"./engine.js":20,"./net.js":43,"./perf.js":46,"./settings.js":55}],45:[function(require,module,exports){
"use strict"
exports.create=create
exports.preloadParticleData=preloadParticleData
var assert=require("assert")
var _require=require("../common/vmath.js"),vec2=_require.vec2,v2copy=_require.v2copy,v2lerp=_require.v2lerp,v2mul=_require.v2mul,vec3=_require.vec3,vec4=_require.vec4,v3add=_require.v3add,v4copy=_require.v4copy,v4lerp=_require.v4lerp,v4mul=_require.v4mul
var sprites=require("./sprites.js")
var textures=require("./textures.js")
var blend_map={alpha:sprites.BLEND_ALPHA,additive:sprites.BLEND_ADDITIVE}
function preloadParticleData(particle_data){for(var key in particle_data.defs){var def=particle_data.defs[key]
for(var part_name in def.particles){var part_def=def.particles[part_name]
textures.load({url:"img/"+part_def.texture+".png"})}}}function normalizeValue(v){if(v instanceof Float32Array&&v.length>=2){return v}else if(typeof v==="number"){return vec2(v,0)}else if(Array.isArray(v)||v instanceof Float32Array){return vec2(v[0]||0,v[1]||0)}else{return assert(false)}}function normalizeValueVec(vec,length){assert(length)
assert(Array.isArray(vec)||vec instanceof Float32Array)
var ret=new Array(length)
for(var ii=0;ii<length;++ii){ret[ii]=normalizeValue(vec[ii])}return ret}function normalizeParticle(def,particle_manager){if(!def.normalized){var norm=def.normalized={blend:blend_map[def.blend]||sprites.BLEND_ALPHA,texture:textures.load({url:def.texture?"img/"+def.texture+".png":"img/glov/util_circle.png"}),color:normalizeValueVec(def.color||[1,1,1,1],4),color_track:null,size:normalizeValueVec(def.size||[1,1],2),size_track:null,accel:normalizeValueVec(def.accel||[0,0,0],3),rot:normalizeValue(def.rot||0),rot_vel:normalizeValue(def.rot||0),lifespan:normalizeValue(def.lifespan||1e3),kill_time_accel:normalizeValue(def.kill_time_accel||1)}
assert(norm.kill_time_accel[0]>=1)
if(def.color_track&&def.color_track.length){assert(def.color_track.length>1)
norm.color_track=[]
for(var ii=0;ii<def.color_track.length;++ii){var e=def.color_track[ii]
assert(typeof e.t==="number")
var arr=new Float32Array(5)
arr[0]=e.v[0]
arr[1]=e.v[1]
arr[2]=e.v[2]
arr[3]=e.v[3]
arr[4]=e.t
norm.color_track.push(arr)}}if(def.size_track&&def.size_track.length){assert(def.size_track.length>1)
norm.size_track=[]
for(var _ii=0;_ii<def.size_track.length;++_ii){var _e=def.size_track[_ii]
assert(typeof _e.t==="number")
var _arr=new Float32Array(3)
_arr[0]=_e.v[0]
_arr[1]=_e.v[1]
_arr[2]=_e.t
norm.size_track.push(_arr)}}}return def.normalized}function findParticle(particles,name){assert(particles[name]!==undefined)
return particles[name]}function normalizeEmitter(def,part_map){if(!def.normalized){def.normalized={part_idx:findParticle(part_map,def.particle),pos:normalizeValueVec(def.pos||[0,0,0],3),vel:normalizeValueVec(def.vel||[0,0,0],3),emit_rate:normalizeValue(def.emit_rate||10),emit_time:normalizeValueVec(def.emit_time||[0,Infinity],2),emit_initial:normalizeValue(def.emit_initial||1)}
var min=def.normalized.emit_rate[0]
var max=def.normalized.emit_rate[0]+def.normalized.emit_rate[1]
def.normalized.emit_rate[0]=1e3/max
def.normalized.emit_rate[1]=1e3/min
assert(def.normalized.emit_rate[0]>1)}return def.normalized}function normalizeDef(def,particle_manager){if(!def.normalized){var norm=def.normalized={system_lifespan:normalizeValue(def.system_lifespan||Infinity),particles:[],emitters:[]}
var part_map={}
for(var key in def.particles){part_map[key]=norm.particles.length
norm.particles.push(normalizeParticle(def.particles[key],particle_manager))}for(var _key in def.emitters){norm.emitters.push(normalizeEmitter(def.emitters[_key],part_map))}}return def.normalized}function instValue(v){return v[0]+Math.random()*v[1]}function instValueVec(v){var ret=new Float32Array(v.length)
for(var ii=0;ii<v.length;++ii){ret[ii]=instValue(v[ii])}return ret}var temp_color=vec4()
var temp_color2=vec4()
var temp_size=vec2()
var temp_size2=vec2()
var ParticleSystem=function(){function ParticleSystem(parent,def_in,pos){assert(pos.length===3)
this.parent=parent
this.def=normalizeDef(def_in,parent)
this.system_lifespan=instValue(this.def.system_lifespan)
assert(this.system_lifespan>0)
this.age=0
this.kill_hard=false
this.kill_soft=false
this.pos=vec3(pos[0],pos[1],pos[2])
this.part_sets=[]
for(var ii=0;ii<this.def.particles.length;++ii){var def=this.def.particles[ii]
var part_set={def:def,parts:[]}
this.part_sets.push(part_set)}this.emitters=[]
for(var _ii2=0;_ii2<this.def.emitters.length;++_ii2){var _def=this.def.emitters[_ii2]
var emitter={def:_def,emit_time:instValueVec(_def.emit_time),countdown:0,started:false,stopped:false}
this.emitters.push(emitter)}}var _proto=ParticleSystem.prototype
_proto.tickParticle=function tickParticle(part,dt){var def=part.def
part.age+=dt
var age_norm=part.age/part.lifespan
if(age_norm>=1){return true}var dts=dt/1e3
part.pos[0]+=part.vel[0]*dts
part.pos[1]+=part.vel[1]*dts
part.pos[2]+=part.vel[2]*dts
part.vel[0]+=part.accel[0]*dts
part.vel[1]+=part.accel[1]*dts
part.vel[2]+=part.accel[2]*dts
v4copy(temp_color,part.color,temp_color)
if(def.color_track){if(age_norm<def.color_track[0][4]){v4mul(temp_color,temp_color,def.color_track[0])}else if(age_norm>=def.color_track[def.color_track.length-1][4]){v4mul(temp_color,temp_color,def.color_track[def.color_track.length-1])}else{for(var ii=0;ii<def.color_track.length-1;++ii){if(age_norm>=def.color_track[ii][4]&&age_norm<def.color_track[ii+1][4]){var weight=(age_norm-def.color_track[ii][4])/(def.color_track[ii+1][4]-def.color_track[ii][4])
v4lerp(temp_color2,weight,def.color_track[ii],def.color_track[ii+1])
v4mul(temp_color,temp_color,temp_color2)
break}}}}v2copy(temp_size,part.size)
if(def.size_track){if(age_norm<def.size_track[0][2]){v2mul(temp_size,temp_size,def.size_track[0])}else if(age_norm>=def.size_track[def.size_track.length-1][2]){v2mul(temp_size,temp_size,def.size_track[def.size_track.length-1])}else{for(var _ii3=0;_ii3<def.size_track.length-1;++_ii3){if(age_norm>=def.size_track[_ii3][2]&&age_norm<def.size_track[_ii3+1][2]){var _weight=(age_norm-def.size_track[_ii3][2])/(def.size_track[_ii3+1][2]-def.size_track[_ii3][2])
v2lerp(temp_size2,_weight,def.size_track[_ii3],def.size_track[_ii3+1])
v2mul(temp_size,temp_size,temp_size2)
break}}}}var w=temp_size[0]
var h=temp_size[1]
var x=part.pos[0]-w/2
var y=part.pos[1]-h/2
var z=part.pos[2]
sprites.queueraw4color([def.texture],x,y,temp_color,0,0,x,y+h,temp_color,0,1,x+w,y+h,temp_color,1,1,x+w,y,temp_color,1,0,z,null,null,def.blend)
return false}
_proto.tickPartSet=function tickPartSet(dt_orig,part_set){var parts=part_set.parts
for(var ii=parts.length-1;ii>=0;--ii){var part=parts[ii]
var dt=this.kill_soft?dt_orig*part.kill_time_accel:dt_orig
if(this.tickParticle(part,dt)){parts[ii]=parts[parts.length-1]
parts.pop()}}}
_proto.emitParticle=function emitParticle(init_dt,emitter){var emitter_def=emitter.def
var part_set=this.part_sets[emitter_def.part_idx]
var def=part_set.def
var pos=instValueVec(emitter_def.pos,3)
v3add(pos,pos,this.pos)
var part={def:def,pos:pos,color:instValueVec(def.color,4),size:instValueVec(def.size,4),vel:instValueVec(emitter_def.vel,3),accel:instValueVec(def.accel,3),rot:instValue(def.rot),rot_vel:instValue(def.rot_vel),lifespan:instValue(def.lifespan),kill_time_accel:instValue(def.kill_time_accel),age:0}
if(!this.tickParticle(part,init_dt)){part_set.parts.push(part)}}
_proto.tickEmitter=function tickEmitter(dt,emitter){var def=emitter.def
if(!emitter.started&&this.age>=emitter.emit_time[0]){emitter.started=true
dt=this.age-emitter.emit_time[0]
var num=instValue(def.emit_initial)
for(var ii=0;ii<num;++ii){this.emitParticle(dt,emitter)}emitter.countdown=instValue(def.emit_rate)}if(emitter.started&&!emitter.stopped&&!this.kill_soft){var remaining_dt=dt
var emit_dt=dt
if(this.age>=emitter.emit_time[1]){emitter.stopped=true
emit_dt-=this.age-emitter.emit_time[1]}while(emit_dt>=emitter.countdown){emit_dt-=emitter.countdown
remaining_dt-=emitter.countdown
emitter.countdown=instValue(def.emit_rate)
this.emitParticle(remaining_dt,emitter)}emitter.countdown-=emit_dt}}
_proto.tick=function tick(dt){if(this.kill_hard){return true}for(var ii=this.part_sets.length-1;ii>=0;--ii){this.tickPartSet(dt,this.part_sets[ii])}this.age+=dt
for(var _ii4=0;_ii4<this.emitters.length;++_ii4){this.tickEmitter(dt,this.emitters[_ii4])}return this.age>=this.system_lifespan}
_proto.shift=function shift(delta){if(this.def.no_shift){return}this.pos[0]+=delta[0]
this.pos[1]+=delta[1]
this.pos[2]+=delta[2]
for(var ii=0;ii<this.part_sets.length;++ii){var parts=this.part_sets[ii].parts
for(var jj=0;jj<parts.length;++jj){var part=parts[jj]
part.pos[0]+=delta[0]
part.pos[1]+=delta[1]
part.pos[2]+=delta[2]}}}
return ParticleSystem}()
var ParticleManager=function(){function ParticleManager(){this.systems=[]}var _proto2=ParticleManager.prototype
_proto2.createSystem=function createSystem(def,pos){var system=new ParticleSystem(this,def,pos)
this.systems.push(system)
return system}
_proto2.tick=function tick(dt){for(var ii=this.systems.length-1;ii>=0;--ii){if(this.systems[ii].tick(dt)){this.systems[ii]=this.systems[this.systems.length-1]
this.systems.pop()}}}
_proto2.killAll=function killAll(){this.systems=[]}
_proto2.shift=function shift(delta){for(var ii=0;ii<this.systems.length;++ii){this.systems[ii].shift(delta)}}
return ParticleManager}()
function create(){return new ParticleManager}

},{"../common/vmath.js":91,"./sprites.js":65,"./textures.js":67,"assert":undefined}],46:[function(require,module,exports){
"use strict"
exports.addMetric=addMetric
exports.draw=draw
exports.friendlyBytes=friendlyBytes
exports.perfGraphOverride=perfGraphOverride
exports.perfSetAutoChannel=perfSetAutoChannel
exports.perf_mem_counters=void 0
var perf_mem_counters={}
exports.perf_mem_counters=perf_mem_counters
var engine=require("./engine.js")
var metrics=[]
function addMetric(metric,first){if(metric.show_graph){metric.num_lines=metric.colors.length
metric.history_size=metric.data.history.length/metric.num_lines}metric.num_labels=Object.keys(metric.labels).length
if(metric.interactable===undefined){metric.interactable=engine.DEBUG&&(metric.num_labels>1&&!metric.show_all||metric.show_graph)}if(first){metrics.splice(0,0,metric)}else{metrics.push(metric)}}var camera2d=require("./camera2d.js")
var _require=require("./cmds.js"),cmd_parse=_require.cmd_parse
var glov_font=require("./font.js")
var input=require("./input.js")
var max=Math.max
var _require2=require("./net.js"),netClient=_require2.netClient,netClientId=_require2.netClientId,netDisconnected=_require2.netDisconnected
var _require3=require("../common/perfcounters.js"),perfCounterHistory=_require3.perfCounterHistory
var _require4=require("./profiler_ui.js"),profilerUI=_require4.profilerUI
var settings=require("./settings.js")
var _require5=require("./sprites.js"),spriteChainedStart=_require5.spriteChainedStart,spriteChainedStop=_require5.spriteChainedStop
var ui=require("./ui.js")
var _require6=require("../common/vmath.js"),vec4=_require6.vec4,v3copy=_require6.v3copy
var METRIC_PAD=2
var bg_default=vec4(0,0,0,.5)
var bg_mouse_over=vec4(0,0,0,.75)
var bg_fade=vec4()
settings.register({show_metrics:{default_value:1,type:cmd_parse.TYPE_INT,range:[0,1]},show_fps:{label:"Show FPS",default_value:engine.DEBUG?1:0,type:cmd_parse.TYPE_INT,range:[0,4]},fps_graph:{label:"FPS Graph",default_value:0,type:cmd_parse.TYPE_INT,range:[0,1]},fps_window:{label:"FPS Time Window (seconds)",default_value:1,type:cmd_parse.TYPE_FLOAT,range:[.001,120]},show_perf_counters:{default_value:0,type:cmd_parse.TYPE_INT,range:[0,1]},show_perf_memory:{default_value:0,type:cmd_parse.TYPE_INT,range:[0,1],access_run:["sysadmin"]},perf_provider:{default_value:"client",type:cmd_parse.TYPE_STRING,usage:"Set the perf provider for /show_perf_counters and /show_perf_memory\n"+"  CLIENT : show client values\n"+"  AUTO : automatically determine appropriate server\n"+"  user.1234 : use server hosting a particular worker",access_run:["sysadmin"]}})
cmd_parse.register({cmd:"fps",help:"Toggles FPS display",func:function func(str,resp_func){if(settings.show_fps&&settings.show_metrics||str==="0"){settings.set("show_fps",0)}else{settings.set("show_fps",1)
settings.set("show_metrics",1)}resp_func()}})
var fps_style=glov_font.style({outline_width:2,outline_color:128,color:4294967295})
function friendlyUnit(table,value){var unit=0
while(unit<table.length-1&&value>=table[unit+1][0]){unit++}if(unit===0){return value+" "+table[unit][1]}return(value/table[unit][0]).toFixed(2)+" "+table[unit][1]}var UNIT_BYTES=[[1,"bytes"],[1024,"KB"],[1024*1024,"MB"],[1024*1024*1024,"GB"]]
var UNIT_COUNT=[[1,""],[1e3,"k"],[1e3*1e3,"m"],[1e3*1e3*1e3,"g"]]
function friendlyBytes(bytes){return friendlyUnit(UNIT_BYTES,bytes)}function friendlyCount(count){return friendlyUnit(UNIT_COUNT,count)}function showMetric(y,metric){var font=engine.font
var pad=METRIC_PAD
var line_height=settings.render_scale_all<1?ui.font_height/settings.render_scale_all:ui.font_height
var METRIC_VALUE_WIDTH=line_height*(metric.width||2.5)
var x=camera2d.x1Real()-METRIC_VALUE_WIDTH-pad
var y0=y
y+=pad
var max_label_w=0
var max_labels=metric.show_all?Infinity:settings[metric.show_stat]
var drew_any=false
var alpha=1
for(var label in metric.labels){var value=metric.labels[label]()
if(value){var style=fps_style
if(value.alpha){alpha=value.alpha
value=value.value
style=glov_font.styleAlpha(fps_style,alpha)}var label_w=font.drawSizedAligned(style,x,y,Z.FPSMETER+3,line_height,glov_font.ALIGN.HRIGHT,0,0,label)
max_label_w=max(max_label_w,label_w)
font.drawSizedAligned(style,x,y,Z.FPSMETER+3,line_height,glov_font.ALIGN.HFIT,METRIC_VALUE_WIDTH,0,value)
y+=line_height
drew_any=true}if(!--max_labels){break}}var w=METRIC_VALUE_WIDTH+max_label_w+METRIC_PAD
x-=max_label_w+METRIC_PAD
if(!drew_any){return y-pad}y+=pad
var bg=bg_default
var pos_param={x:x-pad,y:y0,w:w+pad*2,h:y-y0}
if(metric.interactable){if(input.mouseUpEdge(pos_param)){if(metric.num_labels>1&&settings[metric.show_stat]<=1){settings.set(metric.show_stat,metric.num_labels)}else if(metric.show_graph&&!settings[metric.show_graph]){settings.set(metric.show_graph,1)}else{if(metric.show_graph){settings.set(metric.show_graph,0)}settings.set(metric.show_stat,1)}}if(input.mouseOver(pos_param)){bg=bg_mouse_over}}if(alpha!==1){bg_fade[3]=bg[3]*alpha
bg=v3copy(bg_fade,bg)}ui.drawRect(pos_param.x,pos_param.y,pos_param.x+pos_param.w,y,Z.FPSMETER+2,bg)
return y}function showMetricGraph(y,metric){var small=engine.game_height<300
var LINE_WIDTH=small?1:3
var LINE_PAD=small?0:1
var LINE_HEIGHT=small?64:128
var NUM_LINES=metric.history_size-1
var w=(LINE_WIDTH+LINE_PAD)*NUM_LINES
var x=camera2d.x1Real()-w
var h=LINE_HEIGHT+LINE_PAD*2
var z=Z.FPSMETER
spriteChainedStart()
ui.drawRect(x,y-h,x+w,y,z++,bg_default)
x+=LINE_PAD
y-=LINE_PAD
var history_index=metric.data.index
var line_scale=LINE_HEIGHT/metric.line_scale_top
for(var ii=0;ii<NUM_LINES;ii++){var line_index=(ii+history_index+1)%metric.history_size*metric.num_lines
var data=metric.data.history
var bar_max=0
for(var jj=0;jj<metric.num_lines;jj++){var line_jj=data[line_index+jj]
var bar_min=void 0
if(metric.bars_stack){bar_min=bar_max
bar_max+=line_jj}else{var lesser=0
for(var kk=0;kk<metric.num_lines;kk++){if(kk===jj){continue}var line_kk=data[line_index+kk]
if((line_kk<line_jj||line_kk===line_jj&&kk<jj)&&line_kk>lesser){lesser=line_kk}}bar_min=lesser
bar_max=line_jj}var color=metric.colors[jj]
ui.drawRect(x,y-bar_max*line_scale,x+LINE_WIDTH,y-bar_min*line_scale,z,color)}x+=LINE_WIDTH+LINE_PAD}z+=NUM_LINES
y-=LINE_HEIGHT+LINE_PAD
spriteChainedStop()
return y}function perfDefaultAutoChannel(){var client_id=netClientId()
if(client_id){return"client."+client_id}return null}var auto_channel_cb=perfDefaultAutoChannel
function perfSetAutoChannel(cb){auto_channel_cb=cb}var PERF_NET_CACHE_TIME=1e4
var PERF_NET_CACHE_TIME_MEM=2500
var perf_provider_data={last_update:-Infinity,data:null}
function updatePerfProvider(){var cache_time=PERF_NET_CACHE_TIME
var fields={}
if(settings.show_perf_counters){fields.counters=1}if(settings.show_perf_memory){fields.memory=1
cache_time=PERF_NET_CACHE_TIME_MEM}var provider=settings.perf_provider.toLowerCase()
if(provider==="client"){var ret={source:"client"}
if(fields.counters){ret.counters=perfCounterHistory()}if(fields.memory){ret.memory=perf_mem_counters}return ret}if(perf_provider_data.in_flight||netDisconnected()){return perf_provider_data.data}var now=engine.frame_timestamp
if(now-perf_provider_data.last_update<cache_time){return perf_provider_data.data}var channel_id
if(provider==="auto"){channel_id=auto_channel_cb()}else if(provider.match(/^[^.]+\.[^.]+$/)){channel_id=provider}if(channel_id){perf_provider_data.in_flight=true
netClient().send("perf_fetch",{channel_id:channel_id,fields:fields},function(err,data){if(err){console.error("Error getting perf data: "+Object.keys(fields)+": "+err)}perf_provider_data.data=data
perf_provider_data.last_update=engine.frame_timestamp
perf_provider_data.in_flight=false})}return perf_provider_data.data}function perfMemObjToLines(out,obj,prefix){for(var key in obj){var v=obj[key]
if(v&&typeof v==="object"){perfMemObjToLines(out,v,""+prefix+key+".")}else{if(typeof v==="number"){if(key.endsWith("bytes")||prefix.includes("data_size")){v=friendlyBytes(v)}else{v=friendlyCount(v)}}out.push(""+prefix+key+": "+v)}}}var graph_override=null
function perfGraphOverride(override){graph_override=override}function draw(){camera2d.push()
profilerUI()
camera2d.setAspectFixed(engine.game_width,engine.game_height)
if(settings.show_metrics){var y=camera2d.y0Real()
var y_graph=camera2d.y1Real()
if(graph_override){y_graph=showMetricGraph(y_graph,graph_override)
y_graph-=METRIC_PAD}for(var ii=0;ii<metrics.length;++ii){var metric=metrics[ii]
if(settings[metric.show_stat]){y=showMetric(y,metric)
y+=METRIC_PAD}if(!graph_override&&settings[metric.show_graph]){y_graph=showMetricGraph(y_graph,metric)
y_graph-=METRIC_PAD}}}if(settings.show_perf_counters||settings.show_perf_memory){var font=engine.font
var perf_data=updatePerfProvider()||{}
var _y=camera2d.y0Real()
var y0=_y
var line_height=settings.render_scale_all<1?ui.font_height/settings.render_scale_all:ui.font_height
var column_width=line_height*6
var x0=camera2d.x0Real()
var x=x0+column_width*2
var maxx=x+column_width
var z=Z.FPSMETER+1
var header_x=x0+column_width
if(perf_data.source){font.drawSized(fps_style,header_x,_y,z,line_height,"Source: "+perf_data.source)
_y+=line_height}if(perf_data.log){var w=camera2d.wReal()*.67
maxx=max(maxx,header_x+w)
_y+=font.drawSizedWrapped(fps_style,header_x,_y,z,w,20,line_height,perf_data.log)+4}if(perf_data.memory&&settings.show_perf_memory){var lines=[]
perfMemObjToLines(lines,perf_data.memory,"")
for(var _ii=0;_ii<lines.length;++_ii){font.drawSized(fps_style,x,_y,z,line_height,lines[_ii])
_y+=line_height}}if(perf_data.counters&&settings.show_perf_counters){var hist=perf_data.counters||[]
var by_key={}
for(var _ii2=0;_ii2<hist.length;++_ii2){var set=hist[_ii2]
for(var key in set){by_key[key]=by_key[key]||[]
by_key[key][_ii2]=set[key]}}var keys=Object.keys(by_key)
for(var _ii3=0;_ii3<keys.length;++_ii3){var _key=keys[_ii3]
var data=by_key[_key]
font.drawSizedAligned(fps_style,x-column_width*2,_y,z,line_height,glov_font.ALIGN.HRIGHT|glov_font.ALIGN.HFIT,column_width*2,0,_key+": ")
for(var jj=0;jj<data.length;++jj){if(data[jj]){font.drawSizedAligned(fps_style,x+column_width*jj,_y,z,line_height,glov_font.ALIGN.HFIT,column_width,0,data[jj]+" ")}}maxx=max(maxx,x+column_width*data.length)
_y+=line_height}}ui.drawRect(x0,y0,maxx,_y,z-.1,bg_default)}camera2d.pop()
graph_override=null}

},{"../common/perfcounters.js":86,"../common/vmath.js":91,"./camera2d.js":13,"./cmds.js":16,"./engine.js":20,"./font.js":26,"./input.js":36,"./net.js":43,"./profiler_ui.js":50,"./settings.js":55,"./sprites.js":65,"./ui.js":69}],47:[function(require,module,exports){
"use strict"
exports.enter=enter
exports.exit=exit
exports.isLocked=isLocked
exports.startup=startup
var _require=require("../common/util.js"),eatPossiblePromise=_require.eatPossiblePromise
var user_want_locked=false
var elem
var on_ptr_lock
function isLocked(){return user_want_locked}function pointerLog(msg){console.log("PointerLock: "+msg)}function exit(){pointerLog("Lock exit requested")
user_want_locked=false
eatPossiblePromise(document.exitPointerLock())}function enter(when){user_want_locked=true
on_ptr_lock()
pointerLog("Trying pointer lock in response to "+when)
eatPossiblePromise(elem.requestPointerLock())}function onPointerLockChange(){if(document.pointerLockElement||document.mozPointerLockElement||document.webkitPointerLockElement){pointerLog("Lock successful")
if(!user_want_locked){pointerLog("User canceled lock")
eatPossiblePromise(document.exitPointerLock())}}else{if(user_want_locked){pointerLog("Lock lost")
user_want_locked=false}}}function onPointerLockError(e){pointerLog("Error")
user_want_locked=false}function startup(_elem,_on_ptr_lock){elem=_elem
on_ptr_lock=_on_ptr_lock
elem.requestPointerLock=elem.requestPointerLock||elem.mozRequestPointerLock||elem.webkitRequestPointerLock||function(){}
document.exitPointerLock=document.exitPointerLock||document.mozExitPointerLock||document.webkitExitPointerLock||function(){}
document.addEventListener("pointerlockchange",onPointerLockChange,false)
document.addEventListener("mozpointerlockchange",onPointerLockChange,false)
document.addEventListener("webkitpointerlockchange",onPointerLockChange,false)
document.addEventListener("pointerlockerror",onPointerLockError,false)
document.addEventListener("mozpointerlockerror",onPointerLockError,false)
document.addEventListener("webkitpointerlockerror",onPointerLockError,false)}

},{"../common/util.js":89}],48:[function(require,module,exports){
"use strict"
var typedarrays=[Int8Array,Uint8Array,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array]
if(!Uint8Array.prototype.slice){typedarrays.forEach(function(ArrayType){Object.defineProperty(ArrayType.prototype,"slice",{value:function value(begin,end){if(end===undefined){end=this.length}if(end<0){end=this.length-end}begin=begin||0
if(begin>=this.length){begin=this.length-1}if(end>this.length){end=this.length}if(end<begin){end=begin}var len=end-begin
var ret=new ArrayType(len)
for(var ii=0;ii<len;++ii){ret[ii]=this[begin+ii]}return ret}})})}function cmpDefault(a,b){return a-b}var replacements={join:function join(delim){return Array.prototype.join.call(this,delim)},fill:function fill(value,begin,end){if(end===undefined){end=this.length}for(var ii=begin||0;ii<end;++ii){this[ii]=value}return this},sort:function sort(cmp){Array.prototype.sort.call(this,cmp||cmpDefault)}}
var _loop=function _loop(key){if(!Uint8Array.prototype[key]){typedarrays.forEach(function(ArrayType){Object.defineProperty(ArrayType.prototype,key,{value:replacements[key]})})}}
for(var key in replacements){_loop(key)}if(!String.prototype.endsWith){Object.defineProperty(String.prototype,"endsWith",{value:function value(test){return this.slice(-test.length)===test}})
Object.defineProperty(String.prototype,"startsWith",{value:function value(test){return this.slice(0,test.length)===test}})}if(!String.prototype.includes){Object.defineProperty(String.prototype,"includes",{value:function value(search,start){return this.indexOf(search,start)!==-1}})}if(!Array.prototype.includes){Object.defineProperty(Array.prototype,"includes",{value:function value(search,start){return this.indexOf(search,start)!==-1}})}if(!Object.values){Object.values=function values(obj){return Object.keys(obj).map(function(k){return obj[k]})}}if(!Math.sign){Math.sign=function sign(a){return a<0?-1:a>0?1:0}}

},{}],49:[function(require,module,exports){
"use strict"
exports.MEM_DEPTH_DEFAULT=exports.HIST_TOT=exports.HIST_SIZE=exports.HIST_COMPONENTS=exports.HAS_MEMSIZE=void 0
exports.profilerAvgTime=profilerAvgTime
exports.profilerDump=profilerDump
exports.profilerExport=profilerExport
exports.profilerFrameStart=profilerFrameStart
exports.profilerGarbageEstimate=profilerGarbageEstimate
exports.profilerHistoryIndex=profilerHistoryIndex
exports.profilerImport=profilerImport
exports.profilerMaxMem=profilerMaxMem
exports.profilerMeasureBloat=profilerMeasureBloat
exports.profilerMemDepthGet=profilerMemDepthGet
exports.profilerMemDepthSet=profilerMemDepthSet
exports.profilerNodeRoot=profilerNodeRoot
exports.profilerNodeTick=profilerNodeTick
exports.profilerPause=profilerPause
exports.profilerPaused=profilerPaused
exports.profilerTotalCalls=profilerTotalCalls
exports.profilerWalkTree=profilerWalkTree
exports.profilerWarning=profilerWarning
var HAS_MEMSIZE=Boolean(window.performance&&performance.memory&&performance.memory.usedJSHeapSize)
exports.HAS_MEMSIZE=HAS_MEMSIZE
var HIST_SIZE=128
exports.HIST_SIZE=HIST_SIZE
var HIST_COMPONENTS=3
exports.HIST_COMPONENTS=HIST_COMPONENTS
var HIST_TOT=HIST_SIZE*HIST_COMPONENTS
exports.HIST_TOT=HIST_TOT
var MEM_DEPTH_DEFAULT=2
exports.MEM_DEPTH_DEFAULT=MEM_DEPTH_DEFAULT
var assert=require("assert")
var engine=require("./engine.js")
var floor=Math.floor,max=Math.max,min=Math.min
var _require=require("./local_storage.js"),localStorageGetJSON=_require.localStorageGetJSON,localStorageSetJSON=_require.localStorageSetJSON
var profiler_open_keys=localStorageGetJSON("profiler_open_keys",{})
var last_id=0
function ProfilerEntry(parent,name){this.parent=parent
this.depth=parent?parent.depth+1:0
this.next=null
this.child=null
this.name=name
this.count=0
this.time=0
this.dmem=0
this.start_time=0
this.start_mem=0
this.history=new Float32Array(HIST_TOT)
this.id=++last_id
this.show_children=!(parent&&parent.parent)||profiler_open_keys[this.getKey()]||true
this.color_override=null}ProfilerEntry.prototype.isEmpty=function(){for(var ii=0;ii<HIST_TOT;ii+=HIST_COMPONENTS){if(this.history[ii]){return false}}return true}
ProfilerEntry.prototype.toJSON=function(){var next=this.next,child=this.child
while(next&&next.isEmpty()){next=next.next}while(child&&child.isEmpty()){child=child.next}var ret={i:this.name,h:Array.prototype.slice.call(this.history)}
if(next){ret.n=next}if(child){ret.c=child}return ret}
function profilerEntryFromJSON(parent,obj){var ret=new ProfilerEntry(parent,obj.i)
assert.equal(obj.h.length,ret.history.length)
for(var ii=0;ii<obj.h.length;++ii){ret.history[ii]=obj.h[ii]}if(obj.n){ret.next=profilerEntryFromJSON(parent,obj.n)}if(obj.c){ret.child=profilerEntryFromJSON(ret,obj.c)}return ret}ProfilerEntry.prototype.getKey=function(){if(!this.parent){return""}else{return this.parent.getKey()+"."+this.name}}
ProfilerEntry.prototype.toggleShowChildren=function(){this.show_children=!this.show_children
if(this.show_children){profiler_open_keys[this.getKey()]=1}else{delete profiler_open_keys[this.getKey()]}localStorageSetJSON("profiler_open_keys",profiler_open_keys)}
var root=new ProfilerEntry(null,"root")
var node_out_of_tick=new ProfilerEntry(root,"GPU/idle")
root.child=node_out_of_tick
var node_tick=new ProfilerEntry(root,"tick")
node_out_of_tick.next=node_tick
var current=root
var history_index=0
var paused=false
var mem_depth=MEM_DEPTH_DEFAULT
var total_calls=0
var last_frame_total_calls=0
function memSizeChrome(){return performance.memory.usedJSHeapSize}function memSizeNop(){return 0}var memSize=HAS_MEMSIZE?memSizeChrome:memSizeNop
var mem_is_high_res=10
var WARN_CALLS_COUNT=1e3
function profilerWarning(){if(last_frame_total_calls>WARN_CALLS_COUNT){return"Warning: Too many per-frame profilerStart() calls ("+last_frame_total_calls+" > "+WARN_CALLS_COUNT+")"}else if(!HAS_MEMSIZE){return"To access memory profiling, run in Chrome"}else if(mem_depth>1&&mem_is_high_res<10){return"For precise memory profiling, launch Chrome with --enable-precise-memory-info"}return""}function profilerNodeRoot(){return root}function profilerNodeTick(){return node_tick}function profilerHistoryIndex(){return history_index}var garbage_accum=[0,0]
var garbage_count=[0,0,0]
function profilerFrameStart(){last_frame_total_calls=total_calls
total_calls=0
root.count=1
var now=performance.now()
root.time=now-root.start_time
root.start_time=now
if(mem_depth>0){var memnow=memSize()
root.dmem=memnow-root.start_mem
root.start_mem=memnow}node_out_of_tick.count=1
node_out_of_tick.time=root.time
node_out_of_tick.dmem=root.dmem
for(var _walk=root.child;_walk;_walk=_walk.next){if(_walk===node_out_of_tick){continue}node_out_of_tick.time-=_walk.time
node_out_of_tick.dmem-=_walk.dmem
if(mem_depth>1){if(_walk.count){if(_walk.dmem){mem_is_high_res++}else{mem_is_high_res-=5}}}}var pos=0
var neg=0
for(var _walk2=root.child;_walk2;_walk2=_walk2.next){if(_walk2.dmem<0){neg-=_walk2.dmem}else{pos+=_walk2.dmem}}if(pos>neg){garbage_accum[0]+=pos
garbage_count[0]++}else{garbage_accum[1]+=neg
garbage_count[1]++}if(current!==root){console.error("Profiler starting new frame but some section was not stopped",current&&current.name)
current=root}var walk=root
while(walk){var recursing_down=true
if(!paused){walk.history[history_index]=walk.count
walk.history[history_index+1]=walk.time
walk.history[history_index+2]=walk.dmem}walk.count=0
walk.time=0
walk.dmem=0
do{if(recursing_down&&walk.child){walk=walk.child}else if(walk.next){walk=walk.next}else{walk=walk.parent
recursing_down=false
if(walk){continue}}break}while(true)}if(!paused){history_index=(history_index+HIST_COMPONENTS)%HIST_TOT}}function profilerStart(name){++total_calls
var last=null
var instance
for(instance=current.child;instance;last=instance,instance=instance.next){if(instance.name===name){break}}if(!instance){if(!last){assert(!current.child)
instance=new ProfilerEntry(current,name)
current.child=instance}else{instance=new ProfilerEntry(current,name)
last.next=instance}}else{assert(instance.parent===current)}current=instance
instance.start_time=performance.now()
if(instance.depth<mem_depth){instance.start_mem=memSize()}}function profilerStop(old_name){if(old_name){assert.equal(old_name,current.name)}current.time+=performance.now()-current.start_time
if(current.depth<mem_depth){current.dmem+=memSize()-current.start_mem}current.count++
current=current.parent}function profilerStopStart(name){profilerStop(null)
profilerStart(name)}if(window.performance&&window.performance.now){window.profilerStart=profilerStart
window.profilerStop=profilerStop
window.profilerStopStart=profilerStopStart}function profilerPaused(){return paused}function profilerPause(new_value){paused=new_value}function profilerMemDepthGet(){return mem_depth}function profilerMemDepthSet(value){mem_depth=value}function profilerTotalCalls(){return last_frame_total_calls}var bloat_inner={time:0,mem:0}
var bloat_outer={time:0,mem:0}
var bloat={inner:bloat_inner,outer:bloat_outer}
var MEASURE_KEY1="profilerMeasureBloat"
var MEASURE_KEY2="profilerMeasureBloat:child"
var MEASURE_HIST=10
function profilerMeasureBloat(){var mem_depth_saved=mem_depth
if(mem_depth>=2){mem_depth=Infinity}profilerStart(MEASURE_KEY1)
profilerStart(MEASURE_KEY2)
profilerStopStart(MEASURE_KEY2)
profilerStopStart(MEASURE_KEY2)
profilerStopStart(MEASURE_KEY2)
profilerStop(MEASURE_KEY2)
profilerStop(MEASURE_KEY1)
mem_depth=mem_depth_saved
var walk=null
for(walk=current.child;walk.name!==MEASURE_KEY1;walk=walk.next){}var child=walk.child
assert.equal(child.name,MEASURE_KEY2)
bloat_inner.time=Infinity
bloat_inner.mem=0
bloat_outer.time=Infinity
bloat_outer.mem=0
var count_mem=0
var idx_start=(history_index-HIST_COMPONENTS*MEASURE_HIST+HIST_TOT)%HIST_TOT
for(var offs=0;offs<MEASURE_HIST;offs++){var idx=(idx_start+offs*HIST_COMPONENTS)%HIST_TOT
bloat_inner.time=min(bloat_inner.time,child.history[idx+1])
bloat_outer.time=min(bloat_outer.time,walk.history[idx+1])
if(child.history[idx+2]>0&&walk.history[idx+2]>0){bloat_inner.mem+=child.history[idx+2]
bloat_outer.mem+=walk.history[idx+2];++count_mem}}bloat_inner.time/=4
bloat_outer.time=max(0,bloat_outer.time-bloat_inner.time)/4
var avg_inner_mem=bloat_inner.mem/count_mem/4
bloat_outer.mem=count_mem?max(0,floor((bloat_outer.mem/count_mem-avg_inner_mem)/4)):0
bloat_inner.mem=count_mem?max(0,floor(avg_inner_mem)):0
return bloat}function profilerGarbageEstimate(){var ret
if(garbage_count[0]>garbage_count[1]){ret=garbage_accum[0]/garbage_count[0]}else{ret=garbage_accum[1]/garbage_count[1]}garbage_count[0]=garbage_count[1]=0
garbage_accum[0]=garbage_accum[1]=0
return ret}function profilerWalkTree(use_root,cb){var depth=0
var walk=use_root
while(walk){var recursing_down=true
if(walk!==use_root){if(!cb(walk,depth)){recursing_down=false}}do{if(recursing_down&&walk.child){depth++
walk=walk.child}else if(walk.next){walk=walk.next}else{depth--
walk=walk.parent
recursing_down=false
if(walk){continue}}break}while(true)}}function profilerAvgTime(entry){var sum=0
for(var ii=0;ii<HIST_TOT;ii+=HIST_COMPONENTS){if(entry.history[ii]){sum+=entry.history[ii+1]}}return sum/HIST_SIZE}function profilerMaxMem(entry){var dmem_max=0
for(var ii=0;ii<HIST_TOT;ii+=HIST_COMPONENTS){if(entry.history[ii]){dmem_max=max(dmem_max,entry.history[ii+2])}}return dmem_max}function profilerExport(){var obj={history_index:history_index,root:root,mem_depth:HAS_MEMSIZE?mem_depth:0,calls:last_frame_total_calls,device:{ua:window.navigator.userAgent,vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER),webgl:engine.webgl2?2:1,width:engine.width,height:engine.height}}
var debug_info=gl.getExtension("WEBGL_debug_renderer_info")
if(debug_info){obj.device.renderer_unmasked=gl.getParameter(debug_info.UNMASKED_RENDERER_WEBGL)
obj.device.vendor_unmasked=gl.getParameter(debug_info.UNMASKED_VENDOR_WEBGL)}var str=JSON.stringify(obj)
str=str.replace(/\d\.\d\d\d\d+/g,function(a){a=a[5]>"4"?a.slice(0,4)+(Number(a[4])+1):a.slice(0,5)
while(a.slice(-1)==="0"||a.slice(-1)==="."){a=a.slice(0,-1)}return a})
return str}function profilerImport(text){var obj
try{obj=JSON.parse(text)}catch(e){}if(!obj){return null}obj.root=profilerEntryFromJSON(null,obj.root)
return obj}function profilerDump(){assert(current===root)
var lines=["","","# PROFILER RESULTS"]
var total_frame_time=profilerAvgTime(root)
profilerWalkTree(root,function(walk,depth){var time_sum=0
var count_sum=0
var time_max=0
var sum_count=0
var dmem_max=0
for(var ii=0;ii<HIST_TOT;ii+=HIST_COMPONENTS){if(walk.history[ii]){sum_count++
count_sum+=walk.history[ii]
time_sum+=walk.history[ii+1]
time_max=max(time_max,walk.history[ii+1])
dmem_max=max(dmem_max,walk.history[ii+2])}}if(!count_sum){return true}var percent=time_sum/HIST_SIZE/total_frame_time
var ms=time_sum/sum_count
var count=(count_sum/sum_count).toFixed(0)
var buf=""
for(var _ii=1;_ii<depth;++_ii){buf+="* "}buf+=(percent*100).toFixed(0)+"% "+walk.name+" "
buf+=(ms*1e3).toFixed(0)+" ("+count+") max:"+(time_max*1e3).toFixed(0)
if(HAS_MEMSIZE){buf+=" dmem:"+dmem_max}lines.push(buf)
return true})
var warning=profilerWarning()
if(warning){lines.push("",warning)}lines.push("","")
console.log(lines.join("\n"))}window.profilerDump=profilerDump

},{"./engine.js":20,"./local_storage.js":38,"assert":undefined}],50:[function(require,module,exports){
"use strict"
exports.profilerUI=profilerUI
exports.profilerUIStartup=profilerUIStartup
var camera2d=require("./camera2d.js")
var _require=require("./cmds.js"),cmd_parse=_require.cmd_parse
var engine=require("./engine.js")
var _require2=require("./font.js"),style=_require2.style
var input=require("./input.js")
var floor=Math.floor,max=Math.max,min=Math.min,round=Math.round
var _require3=require("./net.js"),netClient=_require3.netClient,netDisconnected=_require3.netDisconnected
var ui=require("./ui.js")
var _require4=require("./perf.js"),perfGraphOverride=_require4.perfGraphOverride,friendlyBytes=_require4.friendlyBytes
var _require5=require("./profiler.js"),HIST_SIZE=_require5.HIST_SIZE,HIST_COMPONENTS=_require5.HIST_COMPONENTS,HIST_TOT=_require5.HIST_TOT,HAS_MEMSIZE=_require5.HAS_MEMSIZE,MEM_DEPTH_DEFAULT=_require5.MEM_DEPTH_DEFAULT,profilerAvgTime=_require5.profilerAvgTime,profilerImport=_require5.profilerImport,profilerExport=_require5.profilerExport,profilerHistoryIndex=_require5.profilerHistoryIndex,profilerMaxMem=_require5.profilerMaxMem,profilerMeasureBloat=_require5.profilerMeasureBloat,profilerMemDepthGet=_require5.profilerMemDepthGet,profilerMemDepthSet=_require5.profilerMemDepthSet,profilerNodeTick=_require5.profilerNodeTick,profilerNodeRoot=_require5.profilerNodeRoot,profilerPause=_require5.profilerPause,profilerPaused=_require5.profilerPaused,profilerTotalCalls=_require5.profilerTotalCalls,profilerWalkTree=_require5.profilerWalkTree,profilerWarning=_require5.profilerWarning
var settings=require("./settings.js")
var _require6=require("./sprites.js"),spriteChainedStart=_require6.spriteChainedStart,spriteChainedStop=_require6.spriteChainedStop
var _require7=require("../common/util.js"),lerp=_require7.lerp
var _require8=require("../common/vmath.js"),vec2=_require8.vec2,vec4=_require8.vec4
Z.PROFILER=Z.PROFILER||9950
var color_gpu=vec4(.5,.5,1,1)
var loaded_profile=null
var node_out_of_tick
var root
function useNewRoot(new_root){root=new_root
node_out_of_tick=root.child
if(node_out_of_tick){node_out_of_tick.color_override=color_gpu}}function useSavedProfile(text){var obj=profilerImport(text)
if(!obj){ui.modalDialog({title:"Error loading profile",text:text||"No data",buttons:{Ok:null}})
return}useNewRoot(obj.root)
loaded_profile=obj}function useLiveProfile(){useNewRoot(profilerNodeRoot())
loaded_profile=null}function profilerToggle(data,resp_func){useLiveProfile()
if(data==="1"){settings.set("show_profiler",1)}else if(data==="0"){settings.set("show_profiler",0)
profilerMemDepthSet(MEM_DEPTH_DEFAULT)}else{if(settings.show_profiler){if(profilerPaused()){profilerPause(false)}else{settings.set("show_profiler",0)
profilerMemDepthSet(MEM_DEPTH_DEFAULT)}}else{settings.set("show_profiler",1)
profilerPause(true)}}if(resp_func){resp_func()}}var access_show=engine.DEBUG?undefined:["hidden"]
cmd_parse.register({cmd:"profiler_toggle",help:"Show or toggle profiler visibility",access_show:access_show,func:profilerToggle})
var PROFILER_RELATIVE_LABELS=["% of user","% of parent","% of frame","% of mem"]
settings.register({show_profiler:{default_value:0,type:cmd_parse.TYPE_INT,range:[0,1],access_show:access_show},profiler_average:{default_value:1,type:cmd_parse.TYPE_INT,range:[0,1],access_show:["hidden"]},profiler_relative:{default_value:1,type:cmd_parse.TYPE_INT,range:[0,PROFILER_RELATIVE_LABELS.length-1],access_show:["hidden"]},profiler_interactable:{default_value:1,type:cmd_parse.TYPE_INT,range:[0,1],access_show:["hidden"]},profiler_graph:{default_value:0,type:cmd_parse.TYPE_INT,range:[0,1],access_show:["hidden"]},profiler_mem_depth:{default_value:MEM_DEPTH_DEFAULT,type:cmd_parse.TYPE_INT,range:[0,100],access_show:["hidden"]},profiler_hide_bloat:{default_value:1,type:cmd_parse.TYPE_INT,range:[0,1],access_show:access_show}})
var font
var y
var style_time_spike=style(null,{color:4286545919})
var style_number=style(null,{color:4294955263})
var style_percent=style(null,{color:4294955263})
var style_ms=style(null,{color:3506438143})
var style_mem=style(null,{color:3506426111})
var style_header=style(null,{color:4294967295,outline_width:.8,outline_color:4294967295})
var style_name=style(null,{color:4294967295,outline_width:1,outline_color:128})
var FONT_SIZE=22
var LINE_HEIGHT=24
var LINE_YOFFS=(LINE_HEIGHT-FONT_SIZE)/2
var font_number_scale
var font_size_number
var number_yoffs
var bar_w
var Z_BAR=Z.PROFILER
var Z_GRAPH=Z.PROFILER+1
var Z_TREE=Z.PROFILER+2
var Z_NAMES=Z.PROFILER+3
var Z_NUMBER=Z.PROFILER+4
var Z_MS=Z.PROFILER+5
var MS_W=58
var COUNT_W=56
var MSPAIR_W=MS_W+4+COUNT_W
var MEM_W=120
var COL_HEADERS=["Profiler","µs (count)","max","GC / Δmem"]
var COL_W=[400,MSPAIR_W,MS_W,MEM_W]
var COL_X=[]
var bar_x0
COL_X[0]=0
for(var ii=0;ii<COL_W.length;++ii){COL_X[ii+1]=COL_X[ii]+COL_W[ii]+4}var LINE_WIDTH_WITH_MEM=COL_X[COL_W.length]
var LINE_WIDTH_NO_MEM=COL_X[COL_W.length-1]
var color_hint=vec4(0,.25,0,.85)
var color_bar=vec4(0,0,0,.85)
var color_bar2=vec4(.2,.2,.2,.85)
var color_bar_header=vec4(.3,.3,.3,.85)
var color_bar_over=vec4(0,0,.5,.85)
var color_bar_over2=vec4(.2,.2,.7,.85)
var color_bar_parent=vec4(0,0,.3,.85)
var color_bar_parent2=vec4(.2,.2,.4,.85)
var color_timing=vec4(1,1,.5,1)
var color_bar_highlight=vec4(0,0,0,.5)
var GRAPH_FRAME_TIME=16
var GRAPH_MAX_MEM=4096
var total_frame_time
var total_frame_mem
var show_index_count
var show_index_time
var show_index_mem
var do_average
var history_index
var do_ui
var line_width
var show_mem
var mouseover_elem={}
var mouseover_main_elem
var mouseover_bar_idx
var dmem_max_value=0
var perf_graph={history_size:HIST_SIZE,num_lines:2,data:{history:new Float32Array(HIST_SIZE*2),index:0},line_scale_top:GRAPH_FRAME_TIME,bars_stack:true,colors:[vec4(.5,1,.5,1),color_gpu]}
var bloat
var mouseover_param={x:0,peek:true,h:LINE_HEIGHT}
function profilerShowEntryEarly(walk,depth){if(settings.profiler_relative===0&&walk===node_out_of_tick){return false}var count_sum=0
for(var _ii=0;_ii<HIST_TOT;_ii+=HIST_COMPONENTS){count_sum+=walk.history[_ii]}if(!count_sum){return true}mouseover_param.y=y
mouseover_param.w=line_width
if(input.mouseOver(mouseover_param)){mouseover_main_elem=walk
mouseover_elem[walk.id]=1
for(var parent=walk.parent;parent;parent=parent.parent){mouseover_elem[parent.id]=2}}y+=LINE_HEIGHT
if(!walk.show_children){return false}return true}function hasActiveChildren(walk){walk=walk.child
if(!walk){return false}while(walk){for(var _ii2=0;_ii2<HIST_TOT;_ii2+=HIST_COMPONENTS){if(walk.history[_ii2]){return true}}walk=walk.next}return false}function childCallCount(node,with_mem){var walk=node.child
var count=0
while(walk){if(do_average){var total=0
var sum_count=0
for(var _ii3=0;_ii3<HIST_TOT;_ii3+=HIST_COMPONENTS){if(walk.history[_ii3]&&(!with_mem||walk.history[_ii3+2])){sum_count++
total+=walk.history[_ii3]}}if(sum_count){count+=round(total/sum_count)}}else{if(!with_mem||walk.history[show_index_mem]){count+=walk.history[show_index_count]}}count+=childCallCount(walk,with_mem)
walk=walk.next}return count}var click_param={x:0,h:LINE_HEIGHT}
function profilerShowEntry(walk,depth){if(settings.profiler_relative===0&&walk===node_out_of_tick){return false}var time_sum=0
var count_sum=0
var time_max=0
var sum_count=0
var dmem_min=Infinity
var dmem_max=-Infinity
for(var _ii4=0;_ii4<HIST_TOT;_ii4+=HIST_COMPONENTS){if(walk.history[_ii4]){sum_count++
count_sum+=walk.history[_ii4]
time_sum+=walk.history[_ii4+1]
time_max=max(time_max,walk.history[_ii4+1])
var dmem=walk.history[_ii4+2]
dmem_max_value=max(dmem_max_value,dmem)
dmem_min=min(dmem_min,dmem)
dmem_max=max(dmem_max,dmem)}}if(!count_sum){return true}var over=mouseover_elem[walk.id]===1
var parent_over=mouseover_elem[walk.id]===2
if(do_ui){click_param.y=y
click_param.w=line_width
var click=input.click(click_param)
if(click){if(click.button===1){walk.parent.toggleShowChildren()}else{walk.toggleShowChildren()}}}profilerStart("bar graph")
spriteChainedStart()
var color_top=over?color_bar_over:parent_over?color_bar_parent:color_bar
var color_bot=over?color_bar_over2:parent_over?color_bar_parent2:color_bar2
if(!engine.defines.NORECTS){ui.drawRect4Color(0,y,line_width,y+LINE_HEIGHT,Z_BAR,color_top,color_top,color_bot,color_bot)}var x=bar_x0
var offs=1+settings.profiler_graph
var graph_max=settings.profiler_graph?GRAPH_MAX_MEM:GRAPH_FRAME_TIME
for(var _ii5=0;_ii5<HIST_SIZE;++_ii5){var value=walk.history[(history_index+_ii5*HIST_COMPONENTS)%HIST_TOT+offs]
if(value>0){var hv=value/graph_max
var h=min(hv*LINE_HEIGHT,LINE_HEIGHT)
if(hv<1){color_timing[0]=hv
color_timing[1]=1}else{color_timing[0]=1
color_timing[1]=max(0,2-hv)}var color=walk.color_override||color_timing
if(!engine.defines.NORECTS){var elem=ui.drawRect(x+_ii5*bar_w,y+LINE_HEIGHT-h,x+(_ii5+1)*bar_w,y+LINE_HEIGHT,Z_GRAPH,color)
elem.x=elem.y=0}}}spriteChainedStop()
profilerStop("bar graph")
y+=LINE_YOFFS
var prefix
if(hasActiveChildren(walk)){if(!walk.show_children){prefix="▶"}else{prefix="▼"}}var percent=0
if(settings.profiler_relative===1){if(walk.parent){if(do_average){percent=time_sum/HIST_SIZE/profilerAvgTime(walk.parent)}else{percent=walk.history[show_index_time]/walk.parent.history[show_index_time]}}}else if(settings.profiler_relative===3){if(do_average){percent=dmem_max/total_frame_mem}else{percent=walk.history[show_index_mem]/total_frame_mem}}else{if(do_average){percent=time_sum/HIST_SIZE/total_frame_time}else{percent=walk.history[show_index_time]/total_frame_time}}x=depth*FONT_SIZE
if(prefix){font.drawSized(null,x-16,y,Z_TREE,FONT_SIZE,prefix)}x+=FONT_SIZE*2
font.drawSizedAligned(style_percent,x,y+number_yoffs,Z_NUMBER,font_size_number,font.ALIGN.HRIGHT,0,0,(percent*100).toFixed(0)+"%")
x+=4
font.drawSized(style_name,x,y,Z_NAMES,FONT_SIZE,walk.name)
x=COL_X[1]
var ms=do_average?time_sum/sum_count:walk.history[show_index_time]
var count=do_average?(count_sum/sum_count).toFixed(0):walk.history[show_index_count]
font.drawSizedAligned(style_ms,x,y+number_yoffs,Z_MS,font_size_number,font.ALIGN.HRIGHT,MS_W,0,(ms*1e3).toFixed(0))
x+=MS_W+4
font.drawSizedAligned(style_number,x,y+number_yoffs,Z_NUMBER,font_size_number,font.ALIGN.HFIT,COUNT_W,0,"("+count+")")
x=COL_X[2]
var spike=time_max*.25>time_sum/sum_count
font.drawSizedAligned(spike?style_time_spike:style_ms,x,y+number_yoffs,Z_MS,font_size_number,font.ALIGN.HRIGHT,COL_W[2],0,(time_max*1e3).toFixed(0))
if(show_mem){x=COL_X[3]
var mem_value=do_average?dmem_max:walk.history[show_index_mem]
if(mem_value>0){if(do_average){mem_value-=bloat.inner.mem*round(count_sum/sum_count)}else{mem_value-=bloat.inner.mem*walk.history[show_index_count]}var child_count=childCallCount(walk,true)
mem_value=max(0,mem_value-bloat.outer.mem*child_count)}if(dmem_min<0){font.drawSizedAligned(style_time_spike,x,y+number_yoffs,Z_MS,font_size_number,font.ALIGN.HLEFT|font.ALIGN.HFIT,MEM_W/2,0,""+friendlyBytes(-dmem_min))
font.drawSizedAligned(style_mem,x+MEM_W/2,y+number_yoffs,Z_MS,font_size_number,font.ALIGN.HRIGHT|font.ALIGN.HFIT,MEM_W/2,0,""+mem_value)}else{font.drawSizedAligned(style_mem,x,y+number_yoffs,Z_MS,font_size_number,font.ALIGN.HRIGHT,MEM_W,0,""+mem_value)}}y+=FONT_SIZE+LINE_YOFFS
if(!walk.show_children){return false}return true}function doZoomedGraph(){if(settings.profiler_graph){perf_graph.line_scale_top=GRAPH_MAX_MEM
if(!mouseover_main_elem){mouseover_main_elem=profilerNodeTick()}}else if(!mouseover_main_elem||mouseover_main_elem===node_out_of_tick){perf_graph.line_scale_top=GRAPH_FRAME_TIME*2}else{perf_graph.line_scale_top=GRAPH_FRAME_TIME}var offs=1+settings.profiler_graph
if(mouseover_main_elem){var elem=mouseover_main_elem
for(var _ii6=0;_ii6<HIST_SIZE;++_ii6){perf_graph.data.history[_ii6*2]=elem.history[_ii6*HIST_COMPONENTS+offs]
perf_graph.data.history[_ii6*2+1]=0}}else{for(var _ii7=0;_ii7<HIST_SIZE;++_ii7){var idx=_ii7*HIST_COMPONENTS+offs
perf_graph.data.history[_ii7*2]=root.history[idx]-node_out_of_tick.history[idx]
perf_graph.data.history[_ii7*2+1]=node_out_of_tick.history[idx]}}perf_graph.data.index=history_index/HIST_COMPONENTS
perfGraphOverride(perf_graph)}var BUTTON_W=140
var BUTTON_H=48
var BUTTON_FONT_HEIGHT=24
var mouse_pos=vec2()
var bloat_none={inner:{time:0,mem:0},outer:{time:0,mem:0}}
var button_overlay
var button_close
var button_paused
var button_relative
var button_average
var button_graph
var button_mem_dec
var button_mem_depth
var button_mem_inc
var button_max_fps
var button_save
var button_load
var last_line_width
function buttonInit(){var z=Z.PROFILER+10
y=0
var x=line_width
button_overlay={x:x,y:y,z:z,w:BUTTON_W,h:BUTTON_H,font_height:BUTTON_FONT_HEIGHT}
button_close={x:x+BUTTON_W,y:y,z:z,w:BUTTON_H,h:BUTTON_H,font_height:BUTTON_FONT_HEIGHT,text:"X"}
y+=BUTTON_H
button_paused={x:x,y:y,z:z,w:BUTTON_W,h:BUTTON_H,font_height:BUTTON_FONT_HEIGHT}
y+=BUTTON_H
button_relative={x:x,y:y,z:z,w:BUTTON_W,h:BUTTON_H,font_height:BUTTON_FONT_HEIGHT}
y+=BUTTON_H
button_average={x:x,y:y,z:z,w:BUTTON_W,h:BUTTON_H,font_height:BUTTON_FONT_HEIGHT}
y+=BUTTON_H
button_graph={x:x,y:y,z:z,w:BUTTON_W,h:BUTTON_H,font_height:BUTTON_FONT_HEIGHT}
y+=BUTTON_H
y+=LINE_HEIGHT
button_mem_dec={x:x,y:y,z:z,w:BUTTON_W/3,h:BUTTON_H,font_height:BUTTON_FONT_HEIGHT,text:"-"}
button_mem_depth={x:x+BUTTON_W/3,y:y,z:z,w:BUTTON_W/3,h:BUTTON_H,font_height:BUTTON_FONT_HEIGHT}
button_mem_inc={x:x+2*BUTTON_W/3,y:y,z:z,w:BUTTON_W/3,h:BUTTON_H,font_height:BUTTON_FONT_HEIGHT,text:"+"}
y+=BUTTON_H
button_max_fps={x:x,y:y,z:z,w:BUTTON_W,h:BUTTON_H,font_height:BUTTON_FONT_HEIGHT}
y+=BUTTON_H
y+=LINE_HEIGHT
button_save={x:x,y:y,z:z,w:BUTTON_W/2,h:BUTTON_H,font_height:BUTTON_FONT_HEIGHT,text:"save"}
button_load={x:x+BUTTON_W/2,y:y,z:z,w:BUTTON_W/2,h:BUTTON_H,font_height:BUTTON_FONT_HEIGHT,text:"load"}}function profilerUIRun(){profilerStart("profilerUIRun")
profilerStart("top+buttons")
bloat=bloat_none
if(!loaded_profile&&settings.profiler_hide_bloat){bloat=profilerMeasureBloat()}if(engine.render_width){var scale=FONT_SIZE/ui.font_height
camera2d.set(0,0,scale*engine.render_width,scale*engine.render_height)
font_number_scale=1
bar_w=scale}else{camera2d.setScreen(true)
font_number_scale=.9
bar_w=2}bar_x0=COL_X[1]-HIST_SIZE*bar_w
font_size_number=FONT_SIZE*font_number_scale
number_yoffs=(FONT_SIZE-font_size_number)/2
if(profilerMemDepthGet()!==settings.profiler_mem_depth){profilerMemDepthSet(settings.profiler_mem_depth)}if(loaded_profile){history_index=loaded_profile.history_index
show_mem=loaded_profile.mem_depth>0}else{history_index=profilerHistoryIndex()
show_mem=HAS_MEMSIZE}line_width=show_mem?LINE_WIDTH_WITH_MEM:LINE_WIDTH_NO_MEM
if(!button_overlay||line_width!==last_line_width){last_line_width=line_width
buttonInit()}var z=Z.PROFILER+10
y=0
var x=line_width
button_overlay.text=settings.profiler_interactable?"interactable":"overlay"
if(ui.buttonText(button_overlay)){settings.set("profiler_interactable",1-settings.profiler_interactable)}do_ui=settings.profiler_interactable
if(do_ui&&ui.buttonText(button_close)){settings.set("show_profiler",0)}y+=BUTTON_H
var text=loaded_profile?"loaded":profilerPaused()?"paused":"live"
if(do_ui){button_paused.text=text
if(ui.buttonText(button_paused)){if(loaded_profile){useLiveProfile()}else{profilerPause(!profilerPaused())}}}else{font.drawSizedAligned(null,x,y,z,FONT_SIZE,font.ALIGN.HVCENTERFIT,BUTTON_W,BUTTON_H,text)}y+=BUTTON_H
if(do_ui){button_relative.text=PROFILER_RELATIVE_LABELS[settings.profiler_relative]
if(ui.buttonText(button_relative)){settings.set("profiler_relative",(settings.profiler_relative+1)%PROFILER_RELATIVE_LABELS.length)}}else{font.drawSizedAligned(null,x,y,z,FONT_SIZE,font.ALIGN.HVCENTERFIT,BUTTON_W,BUTTON_H,PROFILER_RELATIVE_LABELS[settings.profiler_relative])}y+=BUTTON_H
text=settings.profiler_average?"average":"last frame"
if(do_ui){button_average.text=text
if(ui.buttonText(button_average)){settings.set("profiler_average",1-settings.profiler_average)}}else{font.drawSizedAligned(null,x,y,z,FONT_SIZE,font.ALIGN.HVCENTERFIT,BUTTON_W,BUTTON_H,text)}y+=BUTTON_H
text=settings.profiler_graph?"graph: mem":"graph: CPU"
if(do_ui){button_graph.text=text
if(ui.buttonText(button_graph)){settings.set("profiler_graph",1-settings.profiler_graph)}}else{font.drawSizedAligned(null,x,y,z,FONT_SIZE,font.ALIGN.HVCENTERFIT,BUTTON_W,BUTTON_H,text)}y+=BUTTON_H
if(loaded_profile?true:HAS_MEMSIZE){var cur_depth=loaded_profile?loaded_profile.mem_depth:profilerMemDepthGet()
font.drawSizedAligned(null,x,y,z,FONT_SIZE,font.ALIGN.HVCENTERFIT,BUTTON_W,LINE_HEIGHT,"Mem Depth")
y+=LINE_HEIGHT
text=""+(cur_depth||"OFF")
if(do_ui){button_mem_dec.disabled=loaded_profile||cur_depth===0
if(ui.buttonText(button_mem_dec)){profilerMemDepthSet(cur_depth-1)
settings.set("profiler_mem_depth",profilerMemDepthGet())}button_mem_depth.disabled=loaded_profile
button_mem_depth.text=text
if(ui.buttonText(button_mem_depth)){if(cur_depth===MEM_DEPTH_DEFAULT){profilerMemDepthSet(99)}else{profilerMemDepthSet(MEM_DEPTH_DEFAULT)}settings.set("profiler_mem_depth",profilerMemDepthGet())}button_mem_inc.disabled=loaded_profile
if(ui.buttonText(button_mem_inc)){profilerMemDepthSet(cur_depth+1)
settings.set("profiler_mem_depth",profilerMemDepthGet())}}else{font.drawSizedAligned(null,x,y,z,FONT_SIZE,font.ALIGN.HVCENTERFIT,BUTTON_W,BUTTON_H,text)}}else{y+=LINE_HEIGHT}y+=BUTTON_H
text=settings.max_fps===1e3?"max CPU":settings.max_fps===0?"anim frame":"?"
if(do_ui){button_max_fps.text=text
if(ui.buttonText(button_max_fps)){settings.set("max_fps",settings.max_fps===0?1e3:0)}}else{font.drawSizedAligned(null,x,y,z,FONT_SIZE,font.ALIGN.HVCENTERFIT,BUTTON_W,BUTTON_H,text)}y+=BUTTON_H
font.drawSizedAligned(null,x,y,z,FONT_SIZE,font.ALIGN.HVCENTERFIT,BUTTON_W,LINE_HEIGHT,(loaded_profile?loaded_profile.calls:profilerTotalCalls())+" calls")
y+=LINE_HEIGHT
if(do_ui){button_save.disabled=loaded_profile
if(ui.buttonText(button_save)){var a=document.createElement("a")
a.href="data:application/json,"+encodeURIComponent(profilerExport())
a.setAttribute("download","profile.json")
a.click()}if(ui.buttonText(button_load)){var input_elem=document.createElement("input")
input_elem.setAttribute("type","file")
var reader=new FileReader
reader.onload=function(){if(reader.readyState===2){useSavedProfile(reader.error||reader.result)}}
input_elem.onchange=function(){reader.readAsText(input_elem.files[0])}
input_elem.click()}y+=BUTTON_H}ui.drawRect(x,0,x+BUTTON_W,y,z-1,color_bar)
y=0
font.drawSizedAligned(style_header,COL_X[0],y,z,FONT_SIZE,font.ALIGN.HLEFT,COL_W[0],0,COL_HEADERS[0])
for(var _ii8=1;_ii8<COL_HEADERS.length-(show_mem?0:1);++_ii8){font.drawSizedAligned(style_header,COL_X[_ii8],y,z,FONT_SIZE,font.ALIGN.HCENTER,COL_W[_ii8],0,COL_HEADERS[_ii8])}ui.drawRect(0,y,line_width,y+LINE_HEIGHT,z-1,color_bar_header)
y+=LINE_HEIGHT
var y0=y
mouseover_main_elem=null
mouseover_bar_idx=-1
if(do_ui){mouseover_elem={}
profilerWalkTree(root,profilerShowEntryEarly)
if(mouseover_main_elem){var xx=input.mousePos(mouse_pos)[0]-bar_x0
mouseover_bar_idx=floor(xx/bar_w)
if(mouseover_bar_idx<0||mouseover_bar_idx>=HIST_SIZE){mouseover_bar_idx=-1}dmem_max_value=0
for(var _ii9=0;_ii9<HIST_TOT;_ii9+=HIST_COMPONENTS){if(mouseover_main_elem.history[_ii9]){dmem_max_value=max(dmem_max_value,mouseover_main_elem.history[_ii9+2])}}}}if(dmem_max_value<GRAPH_MAX_MEM*.25||dmem_max_value>GRAPH_MAX_MEM){GRAPH_MAX_MEM=lerp(.1,GRAPH_MAX_MEM,dmem_max_value)}dmem_max_value=0
do_average=settings.profiler_average
show_index_count=(history_index-HIST_COMPONENTS+HIST_TOT)%HIST_TOT
if(mouseover_bar_idx!==-1){do_average=false
show_index_count=(show_index_count-(HIST_SIZE-mouseover_bar_idx-1)*HIST_COMPONENTS+HIST_TOT)%HIST_TOT}show_index_time=show_index_count+1
show_index_mem=show_index_count+2
if(do_average){if(settings.profiler_relative===0){total_frame_time=0
var walk=root.child
while(walk){if(walk!==node_out_of_tick){total_frame_time+=profilerAvgTime(walk)}walk=walk.next}total_frame_time=max(total_frame_time,.001)}else if(settings.profiler_relative===2){total_frame_time=profilerAvgTime(root)}else if(settings.profiler_relative===3){total_frame_mem=profilerMaxMem(root)}}else{if(settings.profiler_relative===0){total_frame_time=0
var _walk=root.child
while(_walk){if(_walk!==node_out_of_tick){total_frame_time+=_walk.history[show_index_time]}_walk=_walk.next}total_frame_time=max(total_frame_time,.001)}else if(settings.profiler_relative===2){total_frame_time=root.history[show_index_time]}else if(settings.profiler_relative===3){total_frame_mem=root.history[show_index_mem]
if(total_frame_mem<0){var _walk2=root.child
total_frame_mem=0
while(_walk2){total_frame_mem+=max(0,_walk2.history[show_index_mem])
_walk2=_walk2.next}}}}profilerStopStart("interface")
y=y0
profilerWalkTree(root,profilerShowEntry)
var hint=!loaded_profile&&profilerWarning()
if(hint){font.drawSizedAligned(style_name,FONT_SIZE,y,Z_NAMES,FONT_SIZE,font.ALIGN.HVCENTERFIT,line_width-FONT_SIZE*2,LINE_HEIGHT*1.5,hint)
ui.drawRect(0,y,line_width,y+LINE_HEIGHT*1.5,Z_NAMES-.5,color_hint)}if(mouseover_bar_idx!==-1){ui.drawRect(bar_x0+mouseover_bar_idx*bar_w,y0,bar_x0+(mouseover_bar_idx+1)*bar_w,y,Z_GRAPH+.5,color_bar_highlight)}if(do_ui){input.mouseOver({x:0,y:0,w:line_width,h:y})}doZoomedGraph()
profilerStop()
profilerStop("profilerUIRun")}function profilerUIStartup(){font=ui.font
useLiveProfile()}function profilerUI(){if(engine.DEBUG&&input.keyUpEdge(input.KEYS.F7)){profilerToggle()}if(settings.show_profiler){profilerUIRun()}if(engine.DEBUG||settings.show_profiler){}}cmd_parse.register({cmd:"profile",help:"Captures a performance profile for developer investigation",prefix_usage_with_help:true,usage:"Optionally delays for DELAY seconds before capturing the profile.\n"+"Usage: /profile [DELAY]",func:function func(str,resp_func){function doit(){var profile=profilerExport()
if(netDisconnected()){ui.provideUserString("Profiler Snapshot",profile)
resp_func()}else{netClient().send("profile",profile,function(err,data){if(data!=null&&data.id){ui.provideUserString("Profile submitted","ID="+data.id)
resp_func(null,"Profile submitted with ID="+data.id)}else{resp_func(err,data)}})}}if(Number(str)){setTimeout(doit,Number(str)*1e3)}else{doit()}}})

},{"../common/util.js":89,"../common/vmath.js":91,"./camera2d.js":13,"./cmds.js":16,"./engine.js":20,"./font.js":26,"./input.js":36,"./net.js":43,"./perf.js":46,"./profiler.js":49,"./settings.js":55,"./sprites.js":65,"./ui.js":69}],51:[function(require,module,exports){
"use strict"
exports.qFromAxisAngle=qFromAxisAngle
exports.qFromYPR=qFromYPR
exports.qInvert=qInvert
exports.qLerp=qLerp
exports.qMult=qMult
exports.qRotateX=qRotateX
exports.qRotateY=qRotateY
exports.qRotateZ=qRotateZ
exports.qSlerp=qSlerp
exports.qTransformVec3=qTransformVec3
exports.qiNegW=qiNegW
exports.qiNormalize=qiNormalize
exports.quat=quat
var _require=require("../common/vmath.js"),vec4=_require.vec4
var acos=Math.acos,cos=Math.cos,sin=Math.sin,sqrt=Math.sqrt
var EPSILON=1e-6
exports.unit_quat=vec4(0,0,0,-1)
function quat(){return vec4(0,0,0,-1)}exports.createQuat=quat
function qiNegW(q){if(q[3]>0){q[0]*=-1
q[1]*=-1
q[2]*=-1
q[3]*=-1}}function qiNormalize(q){var l=sqrt(q[0]*q[0]+q[1]*q[1]+q[2]*q[2]+q[3]*q[3])
if(l!==0){var il=1/l
q[0]*=il
q[1]*=il
q[2]*=il
q[3]*=il}qiNegW(q)}function qFromAxisAngle(out,axis,angle){angle*=.5
var s=sin(angle)
out[0]=s*axis[0]
out[1]=s*axis[1]
out[2]=s*axis[2]
out[3]=cos(angle)
qiNegW(out)
return out}function qFromYPR(out,yaw,pitch,roll){var s_pitch=sin(pitch*.5)
var c_pitch=cos(pitch*.5)
var s_yaw=sin(yaw*.5)
var c_yaw=cos(yaw*.5)
var s_roll=sin(roll*.5)
var c_roll=cos(roll*.5)
var c_pitch_c_yaw=c_pitch*c_yaw
var s_pitch_s_yaw=s_pitch*s_yaw
var s_pitch_c_yaw=s_pitch*c_yaw
var c_pitch_s_yaw=c_pitch*s_yaw
out[0]=s_pitch_c_yaw*c_roll-c_pitch_s_yaw*s_roll
out[1]=s_pitch_s_yaw*c_roll+c_pitch_c_yaw*s_roll
out[2]=c_pitch_s_yaw*c_roll+s_pitch_c_yaw*s_roll
out[3]=c_pitch_c_yaw*c_roll-s_pitch_s_yaw*s_roll
qiNormalize(out)
return out}function qRotateX(out,a,rad){rad*=.5
var ax=a[0]
var ay=a[1]
var az=a[2]
var aw=a[3]
var bx=sin(rad)
var bw=cos(rad)
out[0]=ax*bw+aw*bx
out[1]=ay*bw+az*bx
out[2]=az*bw-ay*bx
out[3]=aw*bw-ax*bx
return out}function qRotateY(out,a,rad){rad*=.5
var ax=a[0]
var ay=a[1]
var az=a[2]
var aw=a[3]
var by=sin(rad)
var bw=cos(rad)
out[0]=ax*bw-az*by
out[1]=ay*bw+aw*by
out[2]=az*bw+ax*by
out[3]=aw*bw-ay*by
return out}function qRotateZ(out,a,rad){rad*=.5
var ax=a[0]
var ay=a[1]
var az=a[2]
var aw=a[3]
var bz=sin(rad)
var bw=cos(rad)
out[0]=ax*bw+ay*bz
out[1]=ay*bw-ax*bz
out[2]=az*bw+aw*bz
out[3]=aw*bw-az*bz
return out}function qSlerp(out,t,a,b){var ax=a[0]
var ay=a[1]
var az=a[2]
var aw=a[3]
var bx=b[0]
var by=b[1]
var bz=b[2]
var bw=b[3]
var scale0
var scale1
var cosom=ax*bx+ay*by+az*bz+aw*bw
if(cosom<0){cosom=-cosom
bx=-bx
by=-by
bz=-bz
bw=-bw}if(1-cosom>EPSILON){var omega=acos(cosom)
var sinom=sin(omega)
scale0=sin((1-t)*omega)/sinom
scale1=sin(t*omega)/sinom}else{scale0=1-t
scale1=t}out[0]=scale0*ax+scale1*bx
out[1]=scale0*ay+scale1*by
out[2]=scale0*az+scale1*bz
out[3]=scale0*aw+scale1*bw
return out}function qTransformVec3(out,a,q){var qx=q[0]
var qy=q[1]
var qz=q[2]
var qw=q[3]
var x=a[0]
var y=a[1]
var z=a[2]
var uvx=qy*z-qz*y
var uvy=qz*x-qx*z
var uvz=qx*y-qy*x
var uuvx=qy*uvz-qz*uvy
var uuvy=qz*uvx-qx*uvz
var uuvz=qx*uvy-qy*uvx
var w2=qw*2
uvx*=w2
uvy*=w2
uvz*=w2
uuvx*=2
uuvy*=2
uuvz*=2
out[0]=x+uvx+uuvx
out[1]=y+uvy+uuvy
out[2]=z+uvz+uuvz
return out}function qMult(out,a,b){var ax=a[0]
var ay=a[1]
var az=a[2]
var aw=a[3]
var bx=b[0]
var by=b[1]
var bz=b[2]
var bw=b[3]
out[0]=ax*bw+aw*bx+ay*bz-az*by
out[1]=ay*bw+aw*by+az*bx-ax*bz
out[2]=az*bw+aw*bz+ax*by-ay*bx
out[3]=aw*bw-ax*bx-ay*by-az*bz
return out}function qInvert(out,a){var a0=a[0]
var a1=a[1]
var a2=a[2]
var a3=a[3]
var denom=a0*a0+a1*a1+a2*a2+a3*a3
var scale=denom?1/denom:0
out[0]=-a0*scale
out[1]=-a1*scale
out[2]=-a2*scale
out[3]=a3*scale
return out}function qLerp(out,t,v0,v1){qiNormalize(v0)
qiNormalize(v1)
var d=v0[0]*v1[0]+v0[1]*v1[1]+v0[2]*v1[2]+v0[3]*v1[3]
var v0_t=(d<0?-1:1)*(1-t)
out[0]=v0[0]*v0_t+v1[0]*t
out[1]=v0[1]*v0_t+v1[1]*t
out[2]=v0[2]*v0_t+v1[2]*t
out[3]=v0[3]*v0_t+v1[3]*t
qiNormalize(out)
return out}

},{"../common/vmath.js":91}],52:[function(require,module,exports){
"use strict"
exports.randFastCreate=randFastCreate
exports.randSimpleSpatial=randSimpleSpatial
function step2(seed){seed=seed>>>0||22329833666
seed^=seed<<13
seed^=seed>>>17
seed^=seed<<5
seed^=seed<<13
seed^=seed>>>17
seed^=seed<<5
return seed>>>0}function RandSeed2(seed){this.seed=step2(seed)}RandSeed2.prototype.reseed=function(seed){this.seed=step2(seed)}
RandSeed2.prototype.step=function(){var seed=this.seed
seed^=seed<<13
seed^=seed>>>17
seed^=seed<<5
return(this.seed=seed>>>0)-1}
RandSeed2.prototype.uint32=RandSeed2.prototype.step
RandSeed2.prototype.range=function(range){return this.step()*range*2.3283064376e-10|0}
RandSeed2.prototype.random=function(){return this.step()*2.3283064376e-10}
RandSeed2.prototype.floatBetween=function(a,b){return a+(b-a)*this.random()}
function randFastCreate(seed){return new RandSeed2(seed)}var RND_A=134775813
var RND_B=1103515245
function randSimpleSpatial(seed,x,y,z){y+=z*10327
return(((x^y)*RND_A^seed+x)*(RND_B*x<<16^RND_B*y-RND_A)>>>0)/4294967295}

},{}],53:[function(require,module,exports){
"use strict"
exports.scrollAreaCreate=scrollAreaCreate
exports.scrollAreaSetPixelScale=scrollAreaSetPixelScale
function _extends(){_extends=Object.assign?Object.assign.bind():function(target){for(var i=1;i<arguments.length;i++){var source=arguments[i]
for(var key in source){if(Object.prototype.hasOwnProperty.call(source,key)){target[key]=source[key]}}}return target}
return _extends.apply(this,arguments)}var assert=require("assert")
var _glovCommonUtilJs=require("../common/util.js")
var clamp=_glovCommonUtilJs.clamp
var merge=_glovCommonUtilJs.merge
var verify=require("../common/verify.js")
var _glovCommonVmath=require("../common/vmath")
var vec2=_glovCommonVmath.vec2
var vec4=_glovCommonVmath.vec4
var _camera2dJs=require("./camera2d.js")
var camera2d=_camera2dJs
var _engineJs=require("./engine.js")
var engine=_engineJs
var _inputJs=require("./input.js")
var input=_inputJs
var _inputJs2=require("./input.js")
var KEYS=_inputJs2.KEYS
var PAD=_inputJs2.PAD
var _spotJs=require("./spot.js")
var SPOT_DEFAULT_BUTTON=_spotJs.SPOT_DEFAULT_BUTTON
var SPOT_STATE_DOWN=_spotJs.SPOT_STATE_DOWN
var SPOT_STATE_FOCUSED=_spotJs.SPOT_STATE_FOCUSED
var spot=_spotJs.spot
var spotSubBegin=_spotJs.spotSubBegin
var spotSubEnd=_spotJs.spotSubEnd
var spotUnfocus=_spotJs.spotUnfocus
var _spritesJs=require("./sprites.js")
var clipPop=_spritesJs.clipPop
var clipPush=_spritesJs.clipPush
var _uiJs=require("./ui.js")
var ui=_uiJs
var max=Math.max,min=Math.min,round=Math.round
var MAX_OVERSCROLL=50
var OVERSCROLL_DELAY_WHEEL=180
function darken(color,factor){return vec4(color[0]*factor,color[1]*factor,color[2]*factor,color[3])}var default_pixel_scale=1
function scrollAreaSetPixelScale(scale){default_pixel_scale=scale}var temp_pos=vec2()
var last_scroll_area_id=0
var ScrollAreaInternal=function(){function ScrollAreaInternal(params){this.id="sa:"+ ++last_scroll_area_id
this.x=0
this.y=0
this.z=Z.UI
this.w=10
this.h=10
this.rate_scroll_click=ui.font_height
this.pixel_scale=default_pixel_scale
this.top_pad=true
this.color=vec4(1,1,1,1)
this.background_color=vec4(.4,.4,.4,1)
this.auto_scroll=false
this.auto_hide=false
this.no_disable=false
this.focusable_elem=null
this.disabled=false
this.scroll_pos=0
this.overscroll=0
this.overscroll_delay=0
this.grabbed_pos=0
this.grabbed=false
this.consumed_click=false
this.drag_start=null
this.began=false
this.last_internal_h=0
this.last_frame=0
this.was_disabled=false
this.scrollbar_visible=false
this.last_max_value=0
params=params||{}
this.applyParams(params)
this.rate_scroll_wheel=params.rate_scroll_wheel||this.rate_scroll_click*2
this.rollover_color=params.rollover_color||darken(this.color,.75)
this.rollover_color_light=params.rollover_color_light||darken(this.color,.95)
assert(this.rollover_color_light!==this.color)
this.disabled_color=params.disabled_color||this.rollover_color}var _proto=ScrollAreaInternal.prototype
_proto.applyParams=function applyParams(params){if(!params){return}merge(this,params)}
_proto.barWidth=function barWidth(){var pixel_scale=this.pixel_scale
var scrollbar_top=ui.sprites.scrollbar_top
return scrollbar_top.uidata.total_w*pixel_scale}
_proto.isFocused=function isFocused(){assert(false,"deprecated?")
return false}
_proto.consumedClick=function consumedClick(){return this.consumed_click}
_proto.isVisible=function isVisible(){return this.scrollbar_visible}
_proto.begin=function begin(params){this.applyParams(params)
var x=this.x,y=this.y,w=this.w,h=this.h,z=this.z,id=this.id
verify(!this.began)
this.began=true
spotSubBegin({x:x,y:y,w:w,h:h,key:id})
clipPush(z+.05,x,y,w-this.barWidth(),h)
var camera_orig_x0=camera2d.x0()
var camera_orig_x1=camera2d.x1()
var camera_orig_y0=camera2d.y0()
var camera_orig_y1=camera2d.y1()
var camera_new_x0=-(x-camera_orig_x0)
var camera_new_y0=-(y-camera_orig_y0)+this.getScrollPos()
var camera_new_x1=camera_new_x0+camera_orig_x1-camera_orig_x0
var camera_new_y1=camera_new_y0+camera_orig_y1-camera_orig_y0
camera2d.push()
camera2d.set(camera_new_x0,camera_new_y0,camera_new_x1,camera_new_y1)}
_proto.getScrollPos=function getScrollPos(){return round(this.scroll_pos+this.overscroll)}
_proto.clampScrollPos=function clampScrollPos(){var clamped_pos=clamp(this.scroll_pos,0,this.last_max_value)
if(this.scroll_pos<0){this.overscroll=max(this.scroll_pos,-MAX_OVERSCROLL)}else if(this.scroll_pos>this.last_max_value){this.overscroll=min(this.scroll_pos-this.last_max_value,MAX_OVERSCROLL)}this.scroll_pos=clamped_pos}
_proto.keyboardScroll=function keyboardScroll(){if(this.was_disabled){return}var modified=false
var pad_shift=input.padButtonDown(PAD.RIGHT_TRIGGER)||input.padButtonDown(PAD.LEFT_TRIGGER)
var value=input.keyDownEdge(KEYS.PAGEDOWN)+(pad_shift?input.padButtonDownEdge(PAD.DOWN):0)
if(value){this.scroll_pos=min(this.scroll_pos+this.h,this.scroll_pos===this.last_max_value?Infinity:this.last_max_value)
modified=true}value=input.keyDownEdge(KEYS.PAGEUP)+(pad_shift?input.padButtonDownEdge(PAD.UP):0)
if(value){this.scroll_pos=max(this.scroll_pos-this.h,this.scroll_pos===0?-this.h:0)
modified=true}if(modified){this.clampScrollPos()}}
_proto.end=function end(h){assert(h>=0)
h=max(h,1)
assert(this.began)
this.began=false
this.consumed_click=false
var focused_sub_elem=spotSubEnd()
camera2d.pop()
clipPop()
if(focused_sub_elem){this.scrollIntoFocus(focused_sub_elem.y,focused_sub_elem.y+focused_sub_elem.h+1,this.h)}var maxvalue=max(h-this.h+1,0)
if(this.scroll_pos>=maxvalue){this.scroll_pos=max(0,maxvalue)}var was_at_bottom=this.scroll_pos===this.last_max_value
if(this.auto_scroll&&(this.last_frame!==engine.getFrameIndex()-1||this.last_internal_h!==h&&was_at_bottom)){this.overscroll=max(0,this.scroll_pos+this.overscroll-maxvalue)
this.scroll_pos=maxvalue}this.last_internal_h=h
this.last_frame=engine.getFrameIndex()
if(this.overscroll){var dt=engine.getFrameDt()
if(dt>=this.overscroll_delay){this.overscroll_delay=0
this.overscroll*=max(1-dt*.008,0)}else{this.overscroll_delay-=dt}}var auto_hide=this.auto_hide,pixel_scale=this.pixel_scale,rollover_color=this.rollover_color,rollover_color_light=this.rollover_color_light
var _ui$sprites=ui.sprites,scrollbar_top=_ui$sprites.scrollbar_top,scrollbar_bottom=_ui$sprites.scrollbar_bottom,scrollbar_trough=_ui$sprites.scrollbar_trough,scrollbar_handle=_ui$sprites.scrollbar_handle,scrollbar_handle_grabber=_ui$sprites.scrollbar_handle_grabber
var bar_w=scrollbar_top.uidata.total_w*pixel_scale
var button_h=min(scrollbar_top.uidata.total_h*pixel_scale,this.h/3)
var button_h_nopad=this.top_pad?button_h:0
var bar_x0=this.x+this.w-bar_w
var handle_h=this.h/h
handle_h=clamp(handle_h,0,1)
var handle_pos=this.h>h?0:this.scroll_pos/(h-this.h)
handle_pos=clamp(handle_pos,0,1)
var handle_pixel_h=handle_h*(this.h-button_h_nopad*2)
var handle_pixel_min_h=scrollbar_handle.uidata.total_h*pixel_scale
var trough_height=this.h-button_h*2
handle_pixel_h=max(handle_pixel_h,min(handle_pixel_min_h,trough_height*.75))
var handle_screenpos=this.y+button_h_nopad+handle_pos*(this.h-button_h_nopad*2-handle_pixel_h)
var top_color=this.color
var bottom_color=this.color
var handle_color=this.color
var trough_color=this.color
var disabled=this.disabled
var auto_hidden=false
if(!this.h){disabled=true
auto_hidden=true}else if(handle_h===1){auto_hidden=true
if(this.no_disable){trough_color=top_color=bottom_color=handle_color=this.disabled_color}else{disabled=true}}this.was_disabled=disabled
var gained_focus=false
if(disabled){trough_color=top_color=bottom_color=handle_color=this.disabled_color
this.drag_start=null}else{var wheel_delta=input.mouseWheel({x:this.x,y:this.y,w:this.w,h:this.h})
if(wheel_delta){this.overscroll_delay=OVERSCROLL_DELAY_WHEEL
this.scroll_pos-=this.rate_scroll_wheel*wheel_delta
if(focused_sub_elem){spotUnfocus()}}var handle_rect={x:bar_x0,y:handle_screenpos,w:bar_w,h:handle_pixel_h,button:0,spot_debug_ignore:true}
var down=input.mouseDownEdge(handle_rect)
if(down){this.grabbed_pos=down.pos[1]-handle_screenpos
this.grabbed=true
handle_color=rollover_color_light}if(this.grabbed){gained_focus=true}if(this.grabbed){var up=input.mouseUpEdge({button:0})
if(up){temp_pos[1]=up.pos[1]
this.consumed_click=true}else if(!input.mouseDownAnywhere(0)){this.grabbed=false
this.consumed_click=true}else{input.mousePos(temp_pos)}if(this.grabbed){var delta=temp_pos[1]-(this.y+button_h_nopad)-this.grabbed_pos
this.scroll_pos=(h-this.h)*delta/(this.h-button_h_nopad*2-handle_pixel_h)
handle_color=rollover_color_light}}if(input.mouseOver(handle_rect)){if(handle_color!==rollover_color_light){handle_color=rollover_color}}var button_param_up={x:bar_x0,y:this.y,w:bar_w,h:button_h,button:0,pad_focusable:false,disabled:this.grabbed,disabled_focusable:false,def:SPOT_DEFAULT_BUTTON}
var button_param_down=_extends({},button_param_up,{y:this.y+this.h-button_h})
var button_spot_ret=spot(button_param_up)
while(button_spot_ret.ret){--button_spot_ret.ret
gained_focus=true
this.scroll_pos-=this.rate_scroll_click
this.consumed_click=true}if(button_spot_ret.spot_state===SPOT_STATE_DOWN){top_color=rollover_color_light}else if(button_spot_ret.spot_state===SPOT_STATE_FOCUSED){top_color=rollover_color}button_spot_ret=spot(button_param_down)
while(button_spot_ret.ret){--button_spot_ret.ret
gained_focus=true
this.scroll_pos+=this.rate_scroll_click
this.consumed_click=true}if(button_spot_ret.spot_state===SPOT_STATE_DOWN){bottom_color=rollover_color_light}else if(button_spot_ret.spot_state===SPOT_STATE_FOCUSED){bottom_color=rollover_color}var bar_param={key:"bar_"+this.id,x:bar_x0,y:this.y,w:bar_w,h:this.h,button:0,sound_rollover:null,pad_focusable:false,def:SPOT_DEFAULT_BUTTON}
var bar_spot_ret=spot(bar_param)
while(bar_spot_ret.ret){--bar_spot_ret.ret
gained_focus=true
this.consumed_click=true
if(bar_spot_ret.pos[1]>handle_screenpos+handle_pixel_h/2){this.scroll_pos+=this.h}else{this.scroll_pos-=this.h}}var drag=input.drag({x:this.x,y:this.y,w:this.w-bar_w,h:this.h,button:0,min_dist:this.min_dist})
if(drag){if(this.drag_start===null){this.drag_start=this.scroll_pos}this.scroll_pos=this.drag_start-drag.cur_pos[1]+drag.start_pos[1]
this.consumed_click=true}else{this.drag_start=null}input.drag({x:this.x+this.w-bar_w,y:this.y,w:bar_w,h:this.h,button:0})}if(gained_focus&&this.focusable_elem){this.focusable_elem.focus()}this.last_max_value=maxvalue
this.clampScrollPos()
if(this.background_color){ui.drawRect(this.x,this.y,this.x+this.w,this.y+this.h,this.z,this.background_color)}if(disabled&&(auto_hide&&auto_hidden||!this.h)){this.scrollbar_visible=false
return}this.scrollbar_visible=true
scrollbar_top.draw({x:bar_x0,y:this.y,z:this.z+.2,w:bar_w,h:button_h,color:top_color})
scrollbar_bottom.draw({x:bar_x0,y:this.y+this.h-button_h,z:this.z+.2,w:bar_w,h:button_h,color:bottom_color})
var trough_draw_pad=button_h/2
var trough_draw_height=trough_height+trough_draw_pad*2
var trough_v0=-trough_draw_pad/pixel_scale/scrollbar_trough.uidata.total_h
var trough_v1=trough_v0+trough_draw_height/pixel_scale/scrollbar_trough.uidata.total_h
scrollbar_trough.draw({x:bar_x0,y:this.y+trough_draw_pad,z:this.z+.1,w:bar_w,h:trough_draw_height,uvs:[scrollbar_trough.uvs[0],trough_v0,scrollbar_trough.uvs[2],trough_v1],color:trough_color})
ui.drawVBox({x:bar_x0,y:handle_screenpos,z:this.z+.3,w:bar_w,h:handle_pixel_h},scrollbar_handle,handle_color)
var grabber_h=scrollbar_handle_grabber.uidata.total_h*pixel_scale
scrollbar_handle_grabber.draw({x:bar_x0,y:handle_screenpos+(handle_pixel_h-grabber_h)/2,z:this.z+.4,w:bar_w,h:grabber_h,color:handle_color})}
_proto.scrollIntoFocus=function scrollIntoFocus(miny,maxy,h){var old_scroll_pos=this.scroll_pos
var changed=false
miny=max(miny,0)
if(miny<this.scroll_pos){this.scroll_pos=miny
changed=true}maxy-=h
if(maxy>this.scroll_pos){this.scroll_pos=maxy
changed=true}if(changed){this.overscroll=old_scroll_pos-this.scroll_pos}}
_proto.scrollToEnd=function scrollToEnd(){this.scroll_pos=this.last_max_value}
_proto.resetScroll=function resetScroll(){this.scroll_pos=0
this.overscroll=0}
return ScrollAreaInternal}()
function scrollAreaCreate(params){return new ScrollAreaInternal(params)}

},{"../common/util.js":89,"../common/verify.js":90,"../common/vmath":91,"./camera2d.js":13,"./engine.js":20,"./input.js":36,"./spot.js":63,"./sprites.js":65,"./ui.js":69,"assert":undefined}],54:[function(require,module,exports){
"use strict"
exports.default_display=exports.GlovMenuItem=void 0
exports.dropDownCreate=dropDownCreate
exports.selboxDefaultDrawItem=selboxDefaultDrawItem
exports.selboxDefaultDrawItemBackground=selboxDefaultDrawItemBackground
exports.selboxDefaultDrawItemText=selboxDefaultDrawItemText
exports.selectionBoxCreate=selectionBoxCreate
var _COLORS
function _inheritsLoose(subClass,superClass){subClass.prototype=Object.create(superClass.prototype)
subClass.prototype.constructor=subClass
_setPrototypeOf(subClass,superClass)}function _setPrototypeOf(o,p){_setPrototypeOf=Object.setPrototypeOf?Object.setPrototypeOf.bind():function _setPrototypeOf(o,p){o.__proto__=p
return o}
return _setPrototypeOf(o,p)}exports.create=selectionBoxCreate
var _assert=require("assert")
var assert=_assert
var max=Math.max,round=Math.round,sin=Math.sin
var _glovCommonUtilJs=require("../common/util.js")
var clamp=_glovCommonUtilJs.clamp
var cloneShallow=_glovCommonUtilJs.cloneShallow
var easeIn=_glovCommonUtilJs.easeIn
var merge=_glovCommonUtilJs.merge
var _glovCommonVmathJs=require("../common/vmath.js")
var v4copy=_glovCommonVmathJs.v4copy
var vec4=_glovCommonVmathJs.vec4
var _camera2dJs=require("./camera2d.js")
var camera2d=_camera2dJs
var _engineJs=require("./engine.js")
var glov_engine=_engineJs
var _fontJs=require("./font.js")
var glov_font=_fontJs
var _inputJs=require("./input.js")
var KEYS=_inputJs.KEYS
var PAD=_inputJs.PAD
var drag=_inputJs.drag
var keyDownEdge=_inputJs.keyDownEdge
var mouseButtonHadUpEdge=_inputJs.mouseButtonHadUpEdge
var padButtonDown=_inputJs.padButtonDown
var padButtonDownEdge=_inputJs.padButtonDownEdge
var _linkJs=require("./link.js")
var link=_linkJs.link
var _scroll_areaJs=require("./scroll_area.js")
var scrollAreaCreate=_scroll_areaJs.scrollAreaCreate
var _spotJs=require("./spot.js")
var SPOT_DEFAULT_BUTTON=_spotJs.SPOT_DEFAULT_BUTTON
var SPOT_NAV_DOWN=_spotJs.SPOT_NAV_DOWN
var SPOT_NAV_LEFT=_spotJs.SPOT_NAV_LEFT
var SPOT_NAV_RIGHT=_spotJs.SPOT_NAV_RIGHT
var SPOT_NAV_UP=_spotJs.SPOT_NAV_UP
var SPOT_STATE_DISABLED=_spotJs.SPOT_STATE_DISABLED
var SPOT_STATE_DOWN=_spotJs.SPOT_STATE_DOWN
var SPOT_STATE_FOCUSED=_spotJs.SPOT_STATE_FOCUSED
var SPOT_STATE_REGULAR=_spotJs.SPOT_STATE_REGULAR
var spot=_spotJs.spot
var spotFocusSteal=_spotJs.spotFocusSteal
var spotPadMode=_spotJs.spotPadMode
var spotSubBegin=_spotJs.spotSubBegin
var spotSubEnd=_spotJs.spotSubEnd
var spotSubPop=_spotJs.spotSubPop
var spotSubPush=_spotJs.spotSubPush
var _spritesJs=require("./sprites.js")
var clipPause=_spritesJs.clipPause
var clipResume=_spritesJs.clipResume
var clipped=_spritesJs.clipped
var _uiJs=require("./ui.js")
var playUISound=_uiJs.playUISound
var _uiJs2=require("./ui.js")
var glov_ui=_uiJs2
var glov_markup=null
var last_key_id=0
var font
var selbox_font_style_default=glov_font.style(null,{color:3755991039})
var selbox_font_style_selected=glov_font.style(null,{color:4294967295})
var selbox_font_style_down=glov_font.style(null,{color:255})
var selbox_font_style_disabled=glov_font.style(null,{color:2155905279})
var pad=8
var color_white=vec4(1,1,1,1)
var color_temp_fade=vec4(1,1,1,1)
function selboxDefaultDrawItemBackground(_ref){var item_idx=_ref.item_idx,item=_ref.item,x=_ref.x,y=_ref.y,z=_ref.z,w=_ref.w,h=_ref.h,image_set=_ref.image_set,color=_ref.color,image_set_extra=_ref.image_set_extra,image_set_extra_alpha=_ref.image_set_extra_alpha
glov_ui.drawHBox({x:x,y:y,z:z,w:w,h:h},image_set,color)
if(image_set_extra&&image_set_extra_alpha){v4copy(color_temp_fade,color)
color_temp_fade[3]*=easeIn(image_set_extra_alpha,2)
glov_ui.drawHBox({x:x,y:y,z:z+.001,w:w,h:h},image_set_extra,color_temp_fade)}}function selboxDefaultDrawItemText(_ref2){var item_idx=_ref2.item_idx,item=_ref2.item,x=_ref2.x,y=_ref2.y,z=_ref2.z,w=_ref2.w,h=_ref2.h,display=_ref2.display,font_height=_ref2.font_height,style=_ref2.style
var text_z=z+1
var did_tab=false
if(display.tab_stop){var str=item.name
var tab_idx=str.indexOf("\t")
if(tab_idx!==-1){did_tab=true
var pre=str.slice(0,tab_idx)
var post=str.slice(tab_idx+1)
var x1=x+display.xpad
var x2=x+display.xpad+display.tab_stop+pad
var w1=display.tab_stop
var w2=w-display.tab_stop-display.xpad*2-pad
if(display.use_markup){var md={}
md.align=glov_font.ALIGN.HFIT
md.x_size=md.y_size=font_height
md.w=w1
md.h=1
md.style=style
glov_markup.print(md,x1,y,text_z,pre)
md.w=w2
glov_markup.print(md,x2,y,text_z,post)}else{font.drawSizedAligned(style,x1,y,text_z,font_height,glov_font.ALIGN.HFIT|glov_font.ALIGN.VCENTER,w1,h,pre)
font.drawSizedAligned(style,x2,y,text_z,font_height,glov_font.ALIGN.HFIT|glov_font.ALIGN.VCENTER,w2,h,post)}}}if(!did_tab){var _md={}
_md.align=(item.centered||display.centered?glov_font.ALIGN.HCENTERFIT:glov_font.ALIGN.HFIT)|glov_font.ALIGN.VCENTER
_md.x_size=_md.y_size=font_height
_md.w=w-display.xpad*2
_md.h=h
_md.style=style
var xx=x+display.xpad
if(display.use_markup){glov_markup.print(_md,xx,y,text_z,item.name)}else{font.drawSizedAligned(_md.style,xx,y,text_z,_md.x_size,_md.align,_md.w,_md.h,item.name)}}}function selboxDefaultDrawItem(param){selboxDefaultDrawItemBackground(param)
selboxDefaultDrawItemText(param)}var default_display={style_default:selbox_font_style_default,style_selected:selbox_font_style_selected,style_disabled:selbox_font_style_disabled,style_down:selbox_font_style_down,color_default:color_white,color_selected:color_white,color_disabled:color_white,color_down:color_white,draw_item_cb:selboxDefaultDrawItem,centered:false,bounce:true,tab_stop:0,xpad:8,selection_fade:Infinity,use_markup:false}
exports.default_display=default_display
var color_gray80=vec4(.5,.5,.5,1)
var color_grayD0=vec4(.816,.816,.816,1)
var COLORS=(_COLORS={},_COLORS[SPOT_STATE_REGULAR]=color_white,_COLORS[SPOT_STATE_DOWN]=color_grayD0,_COLORS[SPOT_STATE_FOCUSED]=color_grayD0,_COLORS[SPOT_STATE_DISABLED]=color_gray80,_COLORS)
var SELBOX_BOUNCE_TIME=80
var GlovMenuItem=function GlovMenuItem(params){params=params||{}
if(params instanceof GlovMenuItem){for(var field in params){this[field]=params[field]}return}if(typeof params==="string"){params={name:params}}this.name=params.name||"NO_NAME"
this.state=params.state||null
this.cb=params.cb||null
this.value=params.value===undefined?null:params.value
this.value_min=params.value_min||0
this.value_max=params.value_max||0
this.value_inc=params.value_inc||0
this.href=params.href||null
this.tag=params.tag||null
this.style=params.style||null
this.exit=Boolean(params.exit)
this.prompt_int=Boolean(params.prompt_int)
this.prompt_string=Boolean(params.prompt_string)
this.no_sound=Boolean(params.no_sound)
this.slider=Boolean(params.slider)
this.no_controller_exit=Boolean(params.no_controller_exit)
this.plus_minus=Boolean(params.plus_minus)
this.disabled=Boolean(params.disabled)
this.centered=Boolean(params.centered)
this.auto_focus=Boolean(params.auto_focus)
this.selection_alpha=0}
exports.GlovMenuItem=GlovMenuItem
var SelectionBoxBase=function(){function SelectionBoxBase(params){assert(!params.auto_unfocus,"Old parameter: auto_unfocus")
this.key="dd"+ ++last_key_id
this.x=0
this.y=0
this.z=Z.UI
this.width=glov_ui.button_width
this.items=[]
this.disabled=false
this.display=cloneShallow(default_display)
this.scroll_height=0
this.font_height=glov_ui.font_height
this.entry_height=glov_ui.button_height
this.auto_reset=true
this.reset_selection=false
this.initial_selection=0
this.show_as_focused=-1
this.applyParams(params)
this.selected=0
this.was_clicked=false
this.was_right_clicked=false
this.is_focused=false
this.expected_frame_index=0
this.ctx={}
if(this.is_dropdown||this.scroll_height){this.sa=scrollAreaCreate({})}}var _proto=SelectionBoxBase.prototype
_proto.applyParams=function applyParams(params){if(!params){return}for(var f in params){if(f==="items"){this.items=params.items.map(function(item){return new GlovMenuItem(item)})}else if(f==="display"){merge(this.display,params[f])}else{this[f]=params[f]}}}
_proto.isSelected=function isSelected(tag_or_index){if(typeof tag_or_index==="number"){return this.selected===tag_or_index}return this.items[this.selected].tag===tag_or_index}
_proto.getSelected=function getSelected(){return this.items[this.selected]}
_proto.handleInitialSelection=function handleInitialSelection(){var auto_reset=this.auto_reset
if(this.reset_selection||auto_reset&&this.expected_frame_index!==glov_engine.getFrameIndex()){this.reset_selection=false
if(this.items[this.initial_selection]&&!this.items[this.initial_selection].disabled){this.selected=this.initial_selection}else{for(var ii=0;ii<this.items.length;++ii){if(!this.items[ii].disabled){this.selected=ii
break}}}}}
_proto.runPrep=function runPrep(y){var ctx=this.ctx,entry_height=this.entry_height,is_dropdown=this.is_dropdown
this.was_clicked=false
this.was_right_clicked=false
var num_non_disabled_selections=0
var first_non_disabled_selection=-1
var last_non_disabled_selection=-1
for(var ii=0;ii<this.items.length;++ii){var item=this.items[ii]
if(!item.disabled){if(first_non_disabled_selection===-1){first_non_disabled_selection=ii}num_non_disabled_selections++
last_non_disabled_selection=ii}}var scroll_height=this.scroll_height
if(!scroll_height&&is_dropdown){scroll_height=camera2d.y1()-(y+entry_height)}ctx.first_non_disabled_selection=first_non_disabled_selection
ctx.last_non_disabled_selection=last_non_disabled_selection
ctx.num_non_disabled_selections=num_non_disabled_selections
ctx.list_visible=!is_dropdown||this.dropdown_visible
ctx.scroll_height=scroll_height}
_proto.selectWalk=function selectWalk(idx,delta){var ctx=this.ctx,old_sel=this.selected,key=this.key
var num_non_disabled_selections=ctx.num_non_disabled_selections,first_non_disabled_selection=ctx.first_non_disabled_selection,last_non_disabled_selection=ctx.last_non_disabled_selection,list_visible=ctx.list_visible
if(!num_non_disabled_selections){this.selected=0}else if(idx>=last_non_disabled_selection){this.selected=last_non_disabled_selection}else if(idx<=first_non_disabled_selection){this.selected=first_non_disabled_selection}else{while(this.items[idx].disabled){idx+=delta}this.selected=idx}if(this.selected!==old_sel){if(list_visible){spotFocusSteal({key:key+"_"+this.selected})}else{this.was_clicked=true}}}
_proto.selectForward=function selectForward(idx){this.selectWalk(idx,1)}
_proto.selectBackward=function selectBackward(idx){this.selectWalk(idx,-1)}
_proto.doPadMovement=function doPadMovement(){var ctx=this.ctx,entry_height=this.entry_height
var list_visible=ctx.list_visible,scroll_height=ctx.scroll_height
var page_size=round(max(scroll_height-1,0)/entry_height)
if(!list_visible){page_size=1}if(page_size){var pad_shift=padButtonDown(PAD.RIGHT_TRIGGER)||padButtonDown(PAD.LEFT_TRIGGER)
var value=keyDownEdge(KEYS.PAGEDOWN)+(pad_shift?padButtonDownEdge(PAD.DOWN):0)
if(value){playUISound("rollover")
this.selectForward(this.selected+page_size*value)}value=keyDownEdge(KEYS.PAGEUP)+(pad_shift?padButtonDownEdge(PAD.UP):0)
if(value){playUISound("rollover")
this.selectBackward(this.selected-page_size*value)}}if(keyDownEdge(KEYS.HOME)){playUISound("rollover")
this.selectForward(0)}if(keyDownEdge(KEYS.END)){playUISound("rollover")
this.selectBackward(Infinity)}}
_proto.doList=function doList(x,y,z,do_scroll,eff_selection){var ctx=this.ctx,disabled=this.disabled,display=this.display,entry_height=this.entry_height,font_height=this.font_height,key=this.key,old_sel=this.selected,show_as_focused=this.show_as_focused,width=this.width
var scroll_height=ctx.scroll_height
var eff_width=width
var y_save=y
if(do_scroll){this.sa.begin({x:x,y:y,z:z,w:width,h:scroll_height})
y=0
x=0
eff_width=width-this.sa.barWidth()}else if(this.is_dropdown){spotSubBegin({key:key,x:x,y:y,z:z,w:width,h:scroll_height||entry_height})}var dt=glov_engine.getFrameDt()
var any_focused=false
var first_non_disabled_selection=ctx.first_non_disabled_selection,last_non_disabled_selection=ctx.last_non_disabled_selection
for(var ii=0;ii<this.items.length;ii++){var _custom_nav
var item=this.items[ii]
var entry_disabled=item.disabled
var image_set=null
var image_set_extra=null
var image_set_extra_alpha=0
if(item.href){link({x:x,y:y,w:width,h:entry_height,url:item.href})}var entry_spot_rect={def:SPOT_DEFAULT_BUTTON,key:key+"_"+ii,disabled:disabled||entry_disabled,disabled_focusable:false,x:x,y:y,w:width,h:entry_height,custom_nav:(_custom_nav={},_custom_nav[SPOT_NAV_RIGHT]=null,_custom_nav[SPOT_NAV_LEFT]=null,_custom_nav),auto_focus:item.auto_focus}
if(ii===first_non_disabled_selection&&this.nav_loop){entry_spot_rect.custom_nav[SPOT_NAV_UP]=key+"_"+last_non_disabled_selection}if(ii===last_non_disabled_selection&&this.nav_loop){entry_spot_rect.custom_nav[SPOT_NAV_DOWN]=key+"_"+first_non_disabled_selection}var entry_spot_ret=spot(entry_spot_rect)
if(ii===show_as_focused){entry_spot_ret.focused=true
entry_spot_ret.spot_state=SPOT_STATE_FOCUSED}var focused_or_down=entry_spot_ret.focused||entry_spot_ret.spot_state===SPOT_STATE_DOWN
any_focused=any_focused||focused_or_down
if(item.slider||item.plus_minus){if(entry_spot_ret.nav===SPOT_NAV_LEFT){entry_spot_ret.nav=SPOT_NAV_RIGHT
entry_spot_ret.button=2}}if(entry_spot_ret.nav===SPOT_NAV_RIGHT){playUISound("button_click")
entry_spot_ret.spot_state=SPOT_STATE_DOWN
entry_spot_ret.ret=true}if(entry_spot_ret.ret){this.was_clicked=true
this.was_right_clicked=entry_spot_ret.button===2
this.selected=ii
this.onListSelect()}var bounce=false
if(focused_or_down){this.selected=ii
if(!this.is_dropdown&&display.bounce){if(this.selected!==old_sel){bounce=true
this.bounce_time=SELBOX_BOUNCE_TIME}else if(dt>=this.bounce_time){this.bounce_time=0}else{bounce=true
this.bounce_time-=dt}}}if(entry_spot_ret.nav===SPOT_NAV_LEFT){this.selected=eff_selection
this.onListSelect()}var color=void 0
var style=void 0
if(entry_spot_ret.spot_state===SPOT_STATE_DOWN||entry_spot_ret.spot_state===SPOT_STATE_FOCUSED){style=display.style_selected||selbox_font_style_selected
color=display.color_selected||default_display.color_selected
item.selection_alpha=clamp(item.selection_alpha+dt*display.selection_fade,0,1)
if(item.selection_alpha===1){image_set=glov_ui.sprites.menu_selected}else{image_set=glov_ui.sprites.menu_entry
image_set_extra=glov_ui.sprites.menu_selected
image_set_extra_alpha=item.selection_alpha}if(entry_spot_ret.spot_state===SPOT_STATE_DOWN){if(glov_ui.sprites.menu_down){image_set=glov_ui.sprites.menu_down
if(display.style_down){style=display.style_down
color=display.color_down||default_display.color_down}}else{style=display.style_down||selbox_font_style_down
color=display.color_down||default_display.color_down}}}else{item.selection_alpha=clamp(item.selection_alpha-dt*display.selection_fade,0,1)
if(item.selection_alpha!==1){image_set_extra=glov_ui.sprites.menu_selected
image_set_extra_alpha=item.selection_alpha}if(entry_spot_ret.spot_state===SPOT_STATE_DISABLED){style=display.style_disabled||selbox_font_style_disabled
color=display.color_disabled||default_display.color_disabled
image_set=glov_ui.sprites.menu_entry}else{style=item.style||display.style_default||selbox_font_style_default
color=display.color_default||default_display.color_default
image_set=glov_ui.sprites.menu_entry}}var yoffs=0
if(bounce){var bounce_amt=sin(this.bounce_time*20/SELBOX_BOUNCE_TIME/10)
yoffs=-4*bounce_amt*entry_height/32}display.draw_item_cb({item_idx:ii,item:item,x:x,y:y+yoffs,z:z+1,w:eff_width,h:entry_height,image_set:image_set,color:color,image_set_extra:image_set_extra,image_set_extra_alpha:image_set_extra_alpha,font_height:font_height,display:display,style:style})
if(entry_spot_ret.ret&&item.href){window.location.href=item.href}y+=entry_height}ctx.scroll_area_consumed_click=false
if(do_scroll){this.sa.end(y)
ctx.scroll_area_consumed_click=this.sa.consumedClick()
y=y_save+scroll_height}else if(this.is_dropdown){drag({x:x,y:y_save,w:width,h:y-y_save})
spotSubEnd()}ctx.any_focused=any_focused
return y}
return SelectionBoxBase}()
var GlovSelectionBox=function(_SelectionBoxBase){_inheritsLoose(GlovSelectionBox,_SelectionBoxBase)
function GlovSelectionBox(params){var _this
assert(!params.is_dropdown,"Use dropDownCreate() instead")
_this=_SelectionBoxBase.call(this,params)||this
_this.bounce_time=0
return _this}var _proto2=GlovSelectionBox.prototype
_proto2.getHeight=function getHeight(){var entry_height=this.entry_height
var list_height=this.items.length*entry_height
var do_scroll=this.scroll_height&&this.items.length*entry_height>this.scroll_height
if(do_scroll){list_height=this.scroll_height}list_height+=2
return list_height+3}
_proto2.focus=function focus(){assert(false,"deprecated?")
var key=this.key
spotFocusSteal({key:key+"_0"})}
_proto2.onListSelect=function onListSelect(){}
_proto2.run=function run(params){this.applyParams(params)
var x=this.x,y=this.y,z=this.z,entry_height=this.entry_height,ctx=this.ctx
this.handleInitialSelection()
var y0=y
var yret
this.runPrep(y)
var scroll_height=ctx.scroll_height
var do_scroll=scroll_height&&this.items.length*entry_height>scroll_height
y=this.doList(x,y,z,do_scroll,this.selected)
if(ctx.any_focused){this.doPadMovement()}this.expected_frame_index=glov_engine.getFrameIndex()+1
x=10
y+=5
yret=y
assert.equal(yret-y0,this.getHeight())
return yret-y0}
return GlovSelectionBox}(SelectionBoxBase)
GlovSelectionBox.prototype.is_dropdown=false
GlovSelectionBox.prototype.nav_loop=false
var GlovDropDown=function(_SelectionBoxBase2){_inheritsLoose(GlovDropDown,_SelectionBoxBase2)
function GlovDropDown(params){var _this2
assert(!params.is_dropdown,"Old parameter: is_dropdown")
_this2=_SelectionBoxBase2.call(this,params)||this
_this2.dropdown_visible=false
_this2.last_selected=undefined
return _this2}var _proto3=GlovDropDown.prototype
_proto3.focus=function focus(){assert(false,"deprecated?")
spotFocusSteal(this)
this.is_focused=true}
_proto3.onListSelect=function onListSelect(){this.dropdown_visible=false
spotFocusSteal(this)}
_proto3.run=function run(params){var _custom_nav2
this.applyParams(params)
var x=this.x,y=this.y,z=this.z,width=this.width,font_height=this.font_height,entry_height=this.entry_height,disabled=this.disabled,key=this.key,display=this.display,ctx=this.ctx
this.handleInitialSelection()
if(this.last_selected!==undefined&&(this.last_selected>=this.items.length||this.items[this.last_selected].disabled)){this.last_selected=undefined}var y0=y
var yret
this.runPrep(y)
var first_non_disabled_selection=ctx.first_non_disabled_selection,list_visible=ctx.list_visible,scroll_height=ctx.scroll_height
var root_spot_rect={key:key,disabled:disabled,x:x,y:y,z:z+2-.1,w:width,h:entry_height,def:SPOT_DEFAULT_BUTTON,custom_nav:(_custom_nav2={},_custom_nav2[SPOT_NAV_RIGHT]=null,_custom_nav2)}
ctx.root_spot_rect=root_spot_rect
if(this.dropdown_visible){root_spot_rect.custom_nav[SPOT_NAV_LEFT]=null
root_spot_rect.custom_nav[SPOT_NAV_DOWN]=key+"_"+first_non_disabled_selection}var root_spot_ret=spot(root_spot_rect)
this.is_focused=root_spot_ret.focused
if(root_spot_ret.kb_focused||list_visible){this.doPadMovement()}this.selectForward(this.selected)
var eff_selection=this.dropdown_visible&&this.last_selected!==undefined?this.last_selected:this.selected
if(this.dropdown_visible&&(keyDownEdge(KEYS.ESC)||padButtonDownEdge(PAD.B))){this.selected=eff_selection
this.onListSelect()}if(root_spot_ret.ret||root_spot_ret.nav){if(root_spot_ret.nav){playUISound("button_click")}if(this.dropdown_visible){this.selected=eff_selection
this.dropdown_visible=false}else{this.dropdown_visible=true
this.last_selected=this.selected
if(spotPadMode()){spotFocusSteal({key:key+"_"+this.selected})}}}glov_ui.drawHBox({x:x,y:y,z:z+1,w:width,h:entry_height},glov_ui.sprites.menu_header,COLORS[root_spot_ret.spot_state])
var align=(display.centered?glov_font.ALIGN.HCENTER:glov_font.ALIGN.HLEFT)|glov_font.ALIGN.HFIT|glov_font.ALIGN.VCENTER
font.drawSizedAligned(root_spot_ret.focused?glov_ui.font_style_focused:glov_ui.font_style_normal,x+display.xpad,y,z+2,font_height,align,width-display.xpad-glov_ui.sprites.menu_header.uidata.wh[2]*entry_height,entry_height,this.items[eff_selection].name)
y+=entry_height
yret=y+2
if(this.dropdown_visible){z+=1e3
var clip_pause=clipped()
if(clip_pause){clipPause()}spotSubPush()
var do_scroll=scroll_height&&this.items.length*entry_height>scroll_height
if(!do_scroll&&y+this.items.length*entry_height>=camera2d.y1()){y=camera2d.y1()-this.items.length*entry_height}this.doList(x,y,z,do_scroll,eff_selection)
if(this.was_clicked){this.dropdown_visible=false}spotSubPop()
if(clip_pause){clipResume()}var any_focused=ctx.any_focused,scroll_area_consumed_click=ctx.scroll_area_consumed_click
if(root_spot_ret.ret||this.was_clicked){any_focused=true}this.is_focused=this.is_focused||any_focused
if(!any_focused){this.selected=eff_selection}if(!any_focused&&!root_spot_ret.focused&&!scroll_area_consumed_click){if(mouseButtonHadUpEdge()||spotPadMode()){this.selected=eff_selection
this.dropdown_visible=false}}}this.expected_frame_index=glov_engine.getFrameIndex()+1
return yret-y0}
return GlovDropDown}(SelectionBoxBase)
GlovDropDown.prototype.is_dropdown=true
GlovDropDown.prototype.nav_loop=true
function selectionBoxCreate(params){if(!font){font=glov_ui.font}return new GlovSelectionBox(params)}function dropDownCreate(params){if(!font){font=glov_ui.font}return new GlovDropDown(params)}

},{"../common/util.js":89,"../common/vmath.js":91,"./camera2d.js":13,"./engine.js":20,"./font.js":26,"./input.js":36,"./link.js":37,"./scroll_area.js":53,"./spot.js":63,"./sprites.js":65,"./ui.js":69,"assert":undefined}],55:[function(require,module,exports){
"use strict"
exports.get=get
exports.pop=pop
exports.push=push
exports.register=register
exports.runTimeDefault=runTimeDefault
exports.set=set
exports.setAsync=setAsync
var modified={}
exports.true=true
var assert=require("assert")
var _require=require("../common/util.js"),titleCase=_require.titleCase
var _require2=require("./cmds.js"),cmd_parse=_require2.cmd_parse
var engine=require("./engine.js")
var change_cbs={}
function get(key){return exports[key]}function set(key,value){if(exports[key]!==value){cmd_parse.handle(null,key+" "+value,null)}}function setAsync(key,value){engine.postTick({fn:set.bind(null,key,value)})}function runTimeDefault(key,new_default){assert(!change_cbs[key])
if(!modified[key]){exports[key]=new_default}}var settings_stack=null
function push(pairs){assert(!settings_stack)
settings_stack={}
for(var key in pairs){settings_stack[key]=exports[key]
exports[key]=pairs[key]
var cb=change_cbs[key]
if(cb){cb(false)}}}function pop(){assert(settings_stack)
for(var key in settings_stack){exports[key]=settings_stack[key]
var cb=change_cbs[key]
if(cb){cb(false)}}settings_stack=null}function register(defs){Object.keys(defs).forEach(function(key){var def=defs[key]
exports[key]=def.default_value
if(def.on_change){change_cbs[key]=def.on_change}cmd_parse.registerValue(key,{type:def.type,label:def.label||titleCase(key.replace(/_/g," ")),range:def.range,get:function get(){return exports[key]},set:function set(v){modified[key]=true
exports[key]=v},store:def.store!==false,ver:def.ver,help:def.help,usage:def.usage,prefix_usage_with_help:def.prefix_usage_with_help,on_change:def.on_change,access_run:def.access_run,access_show:def.access_show,default_value:def.default_value})})}register({max_fps:{label:"Maximum frame rate (FPS)",prefix_usage_with_help:true,usage:"Display current maximum: /max_fps\n"+"Disable maximum FPS limit: /max_fps 0 (highly recommended)\n"+"Set maximum FPS limit: /max_fps 30\n"+"Default: /max_fps 0",default_value:0,type:cmd_parse.TYPE_FLOAT,ver:1},render_scale:{label:"Render Scale (3D)",default_value:1,type:cmd_parse.TYPE_FLOAT,range:[.1,1]},render_scale_mode:{label:"Render Scale Mode",default_value:0,type:cmd_parse.TYPE_INT,range:[0,2]},render_scale_all:{label:"Render Scale (All)",default_value:1,type:cmd_parse.TYPE_FLOAT,range:[.3333,4]},render_scale_clear:{label:"Render Scale Full Clear",default_value:1,type:cmd_parse.TYPE_INT,range:[0,1]},fov:{default_value:60,type:cmd_parse.TYPE_FLOAT,range:[1,100]},double_click_time:{default_value:500,type:cmd_parse.TYPE_INT,range:[0,2500]}})

},{"../common/util.js":89,"./cmds.js":16,"./engine.js":20,"assert":undefined}],56:[function(require,module,exports){
"use strict"
exports.shaderDebugUIStartup=shaderDebugUIStartup
var camera2d=require("./camera2d.js")
var _require=require("./cmds.js"),cmd_parse=_require.cmd_parse
var engine=require("./engine.js")
var _require2=require("./fetch.js"),fetch=_require2.fetch
var glov_font=require("./font.js")
var input=require("./input.js")
var min=Math.min
var _require3=require("./scroll_area.js"),scrollAreaCreate=_require3.scrollAreaCreate
var _require4=require("./shaders.js"),shadersGetDebug=_require4.shadersGetDebug
var settings=require("./settings.js")
var ui=require("./ui.js")
var _require5=require("../common/util.js"),errorString=_require5.errorString
var _require6=require("../common/vmath.js"),vec4=_require6.vec4
Z.SHADER_DEBUG=Z.SHADER_DEBUG||900
var SHADER_STATS_SERVER="http://localhost:3000/api/shaderstats"
var shader_stats_cache={}
function getShaderStats(text,stage,peek){if(shader_stats_cache[text]){return shader_stats_cache[text].data}if(peek){return null}var cache=shader_stats_cache[text]={data:null}
fetch({url:SHADER_STATS_SERVER+"?stage="+stage+"&text="+encodeURIComponent(text),response_type:"json"},function(err,obj){if(err){cache.data={err:"Fetch error: "+errorString(err)}}else{cache.data=obj}})
return cache.data}var PAD=4
var style_title=glov_font.styleColored(null,2156986367)
var style=glov_font.styleColored(null,572662527)
var style_error=glov_font.styleColored(null,3710001919)
var color_line=vec4(.4,.4,.4,1)
var color_panel=vec4(1,1,1,1)
var color_invalid=vec4(.8,0,0,1)
var color_selected=vec4(.4,.6,1,1)
var scroll_area
var scroll_area_source
var selected_shader
function shaderDebugUITick(){var PANEL_PAD=ui.tooltip_pad
var x0=camera2d.x0()+PANEL_PAD
var y0=camera2d.y0()+PANEL_PAD
var z=Z.SHADER_DEBUG
var font=ui.font,title_font=ui.title_font,font_height=ui.font_height
var w=font_height*20
var x=x0
var y=y0
var shaders=shadersGetDebug()
title_font.drawSizedAligned(style_title,x,y,z,font_height,font.ALIGN.HCENTERFIT,w,0,"Shaders ("+shaders.length+")")
if(!scroll_area){scroll_area=scrollAreaCreate({z:z,background_color:null,auto_hide:true})
scroll_area_source=scrollAreaCreate({z:z,background_color:null,auto_hide:true})}var sub_w=w-PAD-scroll_area.barWidth()
var score_w=sub_w*.3
var subscore_w=score_w/2
var button_w=sub_w-score_w-PAD
font.draw({x:x+button_w+PAD,y:y+ui.font_height*.5,z:z,w:subscore_w-1,color:1077952767,size:ui.font_height*.5,text:"Ops",align:font.ALIGN.HCENTERFIT})
font.draw({x:x+button_w+PAD+subscore_w+1,y:y+ui.font_height*.5,z:z,w:subscore_w-1,color:1077952767,size:ui.font_height*.5,text:"Bytes",align:font.ALIGN.HCENTERFIT})
y+=font_height+1
ui.drawLine(x0+w*.3,y,x0+w*.7,y,z,.5,true,color_line)
y+=PAD
var max_h=camera2d.y1()-PAD-y
var scroll_y_start=y
scroll_area.begin({x:x,y:y,w:w,h:max_h})
x=0
y=0
z=Z.UI
for(var ii=0;ii<shaders.length;++ii){var _shader=shaders[ii]
var filename=_shader.filename.replace("shaders/","")
if(_shader.defines_arr.length){filename+="("+_shader.defines_arr.join(",")+")"}if(ui.buttonText({text:filename,x:x,y:y,z:z,w:button_w,h:font_height,color:selected_shader===_shader?color_selected:_shader.valid?undefined:color_invalid,align:glov_font.ALIGN.HFIT})){if(selected_shader===_shader){selected_shader=undefined}else{selected_shader=_shader}}var _stats=getShaderStats(_shader.shader_source_text,_shader.type===gl.FRAGMENT_SHADER?"frag":"vert",false)
if(!_stats||_stats.err){font.draw({x:x+button_w+PAD,y:y,z:z,w:score_w,color:_stats!=null&&_stats.err?2147483903:2155905279,text:_stats!=null&&_stats.err?"ERR":"...",align:font.ALIGN.HCENTERFIT})}else{var _stats$spirv
var color=255
font.draw({x:x+button_w+PAD,y:y,z:z,w:subscore_w-1,color:color,text:""+((_stats$spirv=_stats.spirv)==null?void 0:_stats$spirv.count_total),align:font.ALIGN.HCENTERFIT})
font.draw({x:x+button_w+PAD+subscore_w+1,y:y,z:z,w:subscore_w-1,color:color,text:_stats.bin_size.toLocaleString(),align:font.ALIGN.HCENTERFIT})}y+=font_height}scroll_area.end(y)
y=scroll_y_start+min(max_h,y)
z=Z.SHADER_DEBUG
var close_button_size=ui.font_height
if(ui.buttonText({x:x0+w-close_button_size,y:y0,z:z+1,w:close_button_size,h:close_button_size,text:"X"})){settings.set("shader_debug",0)}ui.panel({x:x0-PANEL_PAD,y:y0-PANEL_PAD,z:z-1,w:w+PANEL_PAD*2,h:y-y0+PANEL_PAD*2,color:color_panel})
if(!selected_shader){return}var shader=selected_shader
x0+=w+PANEL_PAD*2
w=camera2d.x1()-PAD-x0
x=x0
y=y0
font.draw({x:x,y:y,z:z,w:w,style:style,text:shader.filename,align:font.ALIGN.HCENTERFIT})
y+=font_height+1
ui.drawLine(x0+w*.3,y,x0+w*.7,y,z,.5,true,color_line)
y+=PAD
scroll_y_start=y
scroll_area_source.begin({x:x,y:y,w:w,h:max_h})
sub_w=w-PAD-scroll_area_source.barWidth()
x=0
y=0
z=Z.UI
if(shader.error_text){y+=font.draw({x:x,y:y,z:z,w:sub_w,color:2147483903,style:style,text:shader.error_text,align:font.ALIGN.HWRAP})}function flatten(obj,path){for(var key in obj){if(key==="text"||key==="spirv_raw"){continue}var value=obj[key]
var subpath=path?path+"."+key:key
if(typeof value==="object"){flatten(value,subpath)}else{font.draw({x:x,y:y,z:z,w:sub_w,style:style,text:subpath+": "+value,align:font.ALIGN.HFIT})
y+=ui.font_height}}}var stats=getShaderStats(shader.shader_source_text,shader.type===gl.FRAGMENT_SHADER?"frag":"vert")
if(!stats){y+=font.draw({x:x,y:y,z:z,w:w,style:style,text:"Loading shader stats...",align:font.ALIGN.HWRAP})}else if(stats.err){y+=font.draw({x:x,y:y,z:z,w:sub_w,style:style_error,text:String(stats.err),align:font.ALIGN.HWRAP})}else{flatten(stats)}var source_height=ui.font_height*.5
if(stats!=null&&stats.text){y+=PAD
ui.drawLine(x+w*.3,y,x+w*.7,y,z,.5,true,color_line)
y+=PAD/2
font.draw({x:x,y:y,z:z,w:w,style:style,text:"Analyzed Shader Source",align:font.ALIGN.HCENTERFIT})
y+=font_height+1
var _h=font.draw({x:x,y:y,z:z,w:w,size:source_height,style:style,text:stats.text,align:font.ALIGN.HWRAP})
if(input.click({x:x,y:y,w:w,h:_h})){ui.provideUserString("Analyzed shader source",stats.text)}y+=_h}if(stats!=null&&stats.spirv_raw){y+=PAD
ui.drawLine(x+w*.3,y,x+w*.7,y,z,.5,true,color_line)
y+=PAD/2
font.draw({x:x,y:y,z:z,w:w,style:style,text:"SPIR-V Disassembly",align:font.ALIGN.HCENTERFIT})
y+=font_height+1
var _h2=font.draw({x:x,y:y,z:z,w:w,size:source_height,style:style,text:stats.spirv_raw,align:font.ALIGN.HWRAP})
if(input.click({x:x,y:y,w:w,h:_h2})){ui.provideUserString("SPIR-V Disassembly",stats.spirv_raw)}y+=_h2}y+=PAD
ui.drawLine(x+w*.3,y,x+w*.7,y,z,.5,true,color_line)
y+=PAD/2
font.draw({x:x,y:y,z:z,w:w,style:style,text:"Actual WebGL Shader Source",align:font.ALIGN.HCENTERFIT})
y+=font_height+1
var h=font.draw({x:x,y:y,z:z,w:w,size:source_height,style:style,text:shader.shader_source_text,align:font.ALIGN.HWRAP})
if(input.click({x:x,y:y,w:w,h:h})){ui.provideUserString("Used WebGL shader source",shader.shader_source_text)}y+=h
scroll_area_source.end(y)
y=scroll_y_start+min(max_h,y)
z=Z.SHADER_DEBUG
ui.panel({x:x0-PANEL_PAD,y:y0-PANEL_PAD,z:z-1,w:w+PANEL_PAD*2,h:y-y0+PANEL_PAD*2,color:color_panel})}function shaderDebugUIStartup(){settings.register({shader_debug:{label:"Shader Debug",default_value:0,type:cmd_parse.TYPE_INT,range:[0,1],access_show:["sysadmin"],on_change:function on_change(){engine.removeTickFunc(shaderDebugUITick)
if(settings.shader_debug){engine.addTickFunc(shaderDebugUITick)}}}})}

},{"../common/util.js":89,"../common/vmath.js":91,"./camera2d.js":13,"./cmds.js":16,"./engine.js":20,"./fetch.js":24,"./font.js":26,"./input.js":36,"./scroll_area.js":53,"./settings.js":55,"./shaders.js":57,"./ui.js":69}],57:[function(require,module,exports){
"use strict"
exports.MAX_SEMANTIC=void 0
exports.addGlobal=addGlobal
exports.addReservedDefine=addReservedDefine
exports.bind=bind
exports.create=create
exports.globals=void 0
exports.handleDefinesChanged=handleDefinesChanged
exports.prelink=prelink
exports.semantic=void 0
exports.setInternalDefines=setInternalDefines
exports.shadersGetDebug=shadersGetDebug
exports.shadersRequirePrelink=shadersRequirePrelink
exports.shadersResetState=shadersResetState
exports.startup=startup
var MAX_SEMANTIC=5
exports.MAX_SEMANTIC=MAX_SEMANTIC
var assert=require("assert")
var engine=require("./engine.js")
var _require=require("./error_report.js"),errorReportClear=_require.errorReportClear,errorReportSetDetails=_require.errorReportSetDetails,glovErrorReport=_require.glovErrorReport
var _require2=require("./filewatch.js"),filewatchOn=_require2.filewatchOn
var _require3=require("../common/util.js"),matchAll=_require3.matchAll,nop=_require3.nop
var _require4=require("./textures.js"),texturesUnloadDynamic=_require4.texturesUnloadDynamic
var _require5=require("./webfs.js"),webFSGetFile=_require5.webFSGetFile
var last_id=0
var bound_prog=null
var semantic={ATTR0:0,POSITION:0,ATTR1:1,COLOR:1,COLOR_0:1,ATTR2:2,TEXCOORD:2,TEXCOORD_0:2,ATTR3:3,NORMAL:3,ATTR4:4,TEXCOORD_1:4}
exports.semantic=semantic
var globals
exports.globals=globals
var globals_used
var global_defines
var error_fp
var error_fp_webgl2
var error_vp
var shaders=[]
var vp_attr_regex=/attribute [^ ]+ ([^ ;]+);/g
var uniform_regex=/uniform (?:(?:low|medium|high)p )?((?:(?:vec|mat)\d(?:x\d)?|float) [^ ;]+);/g
var sampler_regex=/uniform sampler(?:2D|Cube) ([^ ;]+);/g
var include_regex=/\n#include "([^"]+)"/g
var type_size={float:1,vec2:2*1,vec3:3*1,vec4:4*1,mat3:3*3,mat4:4*4}
function loadInclude(filename){var text=webFSGetFile(filename,"text")
return'\n// from include "'+filename+'":\n'+text+"\n"}function shadersResetState(){for(var ii=0;ii<shaders.length;++ii){var shader=shaders[ii]
if(shader.programs){for(var fpid in shader.programs){var prog=shader.programs[fpid]
for(var jj=0;jj<prog.uniforms.length;++jj){var unif=prog.uniforms[jj]
for(var kk=0;kk<unif.size;++kk){unif.value[kk]=NaN}}}}}bound_prog=null
gl.useProgram(null)}function setGLErrorReportDetails(){var details={max_fragment_uniform_vectors:gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),max_varying_vectors:gl.getParameter(gl.MAX_VARYING_VECTORS),max_vertex_attribs:gl.getParameter(gl.MAX_VERTEX_ATTRIBS),max_vertex_uniform_vectors:gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER),webgl:engine.webgl2?2:1}
var debug_info=gl.getExtension("WEBGL_debug_renderer_info")
if(debug_info){details.renderer_unmasked=gl.getParameter(debug_info.UNMASKED_RENDERER_WEBGL)
details.vendor_unmasked=gl.getParameter(debug_info.UNMASKED_VENDOR_WEBGL)}for(var key in details){errorReportSetDetails(key,details[key])}}var report_queued=false
var shader_errors
var shader_errors_any_fatal
var reported_shader_errors=false
function reportShaderError(non_fatal,err){function doReport(){report_queued=false
setGLErrorReportDetails()
var msg="Shader error(s):\n    "+shader_errors.join("\n    ")
reported_shader_errors=true
if(!shader_errors_any_fatal){glovErrorReport(false,msg,"shaders.js")}else{assert(false,msg)}shader_errors=null}if(!report_queued){setTimeout(doReport,1e3)
report_queued=true
shader_errors=[]
shader_errors_any_fatal=false}shader_errors_any_fatal=shader_errors_any_fatal||!non_fatal
shader_errors.push(err)}function parseIncludes(parent_name,text){var supplied_uniforms={}
text.replace(uniform_regex,function(str,key){supplied_uniforms[key]=true})
text=text.replace(include_regex,function(str,filename){var include_path=parent_name.split("/")
include_path.pop()
include_path.push(filename)
include_path=include_path.join("/")
var replacement=loadInclude(include_path)
if(!replacement){console.error("Could not evaluate "+str)
return str}replacement=replacement.replace(uniform_regex,function(str2,key){if(supplied_uniforms[key]){return"// [removed "+key+"]"}supplied_uniforms[key]=true
return str2})
return replacement})
return text}var webgl2_header=["#version 300 es","#define WEBGL2"].join("\n")
var webgl2_header_fp=[webgl2_header,"#define varying in","out lowp vec4 fragColor;","#define gl_FragColor fragColor","#define texture2D texture","#define textureCube texture",""].join("\n")
var webgl2_header_vp=[webgl2_header,"#define varying out","#define attribute in",""].join("\n")
function Shader(params){var filename=params.filename,defines=params.defines,non_fatal=params.non_fatal
assert.equal(typeof filename,"string")
var type=filename.endsWith(".fp")?gl.FRAGMENT_SHADER:filename.endsWith(".vp")?gl.VERTEX_SHADER:0
assert(type)
this.type=type
this.filename=filename
this.non_fatal=non_fatal
this.defines_arr=defines||[]
this.defines=this.defines_arr.map(function(a){return"#define "+a+"\n"}).join("")
this.shader=gl.createShader(type)
this.id=++last_id
if(type===gl.VERTEX_SHADER){this.programs={}}shaders.push(this)
this.compile()}function shadersGetDebug(){return shaders}function cleanShaderError(error_text){if(error_text){error_text=error_text.replace(/\0/g,"").trim()}return error_text}Shader.prototype.compile=function(){var type=this.type,filename=this.filename
var header=""
var text=webFSGetFile(filename,"text")
if(engine.webgl2&&text.includes("#pragma WebGL2")){header=type===gl.VERTEX_SHADER?webgl2_header_vp:webgl2_header_fp}text=""+header+global_defines+this.defines+text
text=parseIncludes(filename,text)
text=text.replace(/#pragma WebGL2?/g,"")
if(type===gl.VERTEX_SHADER){this.attributes=matchAll(text,vp_attr_regex)
this.attributes.forEach(function(v){return assert(semantic[v]!==undefined)})}else{this.samplers=matchAll(text,sampler_regex)
var found=[]
this.samplers.forEach(function(v){var num=Number(v.slice(-1))
assert(!isNaN(num))
assert(!found[num])
found[num]=true})}this.uniforms=matchAll(text,uniform_regex)
this.uniforms.forEach(function(v){var type_name=v.split(" ")[0]
assert(type_size[type_name])})
this.shader_source_text=text
gl.shaderSource(this.shader,text)
gl.compileShader(this.shader)
if(!gl.getShaderParameter(this.shader,gl.COMPILE_STATUS)){this.valid=false
var error_text=this.error_text=cleanShaderError(gl.getShaderInfoLog(this.shader))
if(this.defines_arr.length){filename+="("+this.defines_arr.join(",")+")"}console[this.non_fatal?"warn":"error"]("Error compiling "+filename+": "+error_text)
reportShaderError(this.non_fatal,filename+": "+error_text)
console.log(text.split("\n").map(function(line,idx){return idx+1+": "+line}).join("\n"))}else{this.valid=true
if(this.error_text){delete this.error_text}}}
function create(filename){if(typeof filename==="object"){return new Shader(filename)}return new Shader({filename:filename})}function uniformSetValue(unif){switch(unif.width){case 1:gl.uniform1fv(unif.location,unif.value)
break
case 2:gl.uniform2fv(unif.location,unif.value)
break
case 3:gl.uniform3fv(unif.location,unif.value)
break
case 4:gl.uniform4fv(unif.location,unif.value)
break
case 9:gl.uniformMatrix3fv(unif.location,false,unif.value)
break
case 16:gl.uniformMatrix4fv(unif.location,false,unif.value)
break}}var require_prelink=false
function shadersRequirePrelink(ensure){var old=require_prelink
require_prelink=ensure
return old}function link(vp,fp,on_error){assert(!require_prelink)
var prog=vp.programs[fp.id]={handle:gl.createProgram(),uniforms:null}
if(!prog.handle){assert(false,"gl.createProgram() returned "+prog.handle+(gl.createProgram()?", retry would succeed":""))}gl.attachShader(prog.handle,vp.shader)
gl.attachShader(prog.handle,fp.shader)
for(var ii=0;ii<vp.attributes.length;++ii){gl.bindAttribLocation(prog.handle,semantic[vp.attributes[ii]],vp.attributes[ii])}gl.linkProgram(prog.handle)
prog.valid=gl.getProgramParameter(prog.handle,gl.LINK_STATUS)
if(!prog.valid){var error_text=cleanShaderError(gl.getProgramInfoLog(prog.handle))
console.error("Shader link error: "+error_text)
if(on_error&&(!engine.DEBUG||on_error===nop)){on_error(error_text)}else{reportShaderError(false,"Shader link error ("+vp.filename+" & "+fp.filename+"):"+(" "+error_text))}prog.uniforms=[]
return prog}gl.useProgram(prog.handle)
bound_prog=prog
var uniforms=vp.uniforms.slice(0)
for(var _ii=0;_ii<fp.uniforms.length;++_ii){var name=fp.uniforms[_ii]
if(uniforms.indexOf(name)===-1){uniforms.push(name)}}prog.uniforms=uniforms.map(function(v){v=v.split(" ")
var type=v[0]
var name=v[1]
var count=1
var m=name.match(/([^[]+)\[(\d+)\]/)
if(m){name=m[1]
count=Number(m[2])}var location=gl.getUniformLocation(prog.handle,name)
if(location===null){return null}var width=type_size[type]
var size=width*count
var glob=globals[name]
globals_used[name]=true
var value=new Float32Array(size)
var unif={name:name,size:size,width:width,count:count,value:value,location:location,glob:glob}
uniformSetValue(unif)
return unif}).filter(function(v){return v})
for(var _ii2=0;_ii2<fp.samplers.length;++_ii2){var _name=fp.samplers[_ii2]
var num=Number(_name.slice(-1))
var location=gl.getUniformLocation(prog.handle,_name)
if(location!==null){gl.uniform1i(location,num)}}return prog}function autoLink(vp,fp,on_error){var prog=vp.programs[fp.id]
if(!prog){prog=link(vp,fp,on_error)}if(!prog.valid){prog=link(vp,error_fp,nop)
if(!prog.valid&&error_fp_webgl2){prog=link(vp,error_fp_webgl2,nop)}if(!prog.valid){prog=link(error_vp,error_fp,nop)}vp.programs[fp.id]=prog}return prog}function bind(vp,fp,params){var prog=vp.programs[fp.id]
if(!prog){prog=autoLink(vp,fp)}if(prog!==bound_prog){bound_prog=prog
gl.useProgram(prog.handle)}for(var ii=0;ii<prog.uniforms.length;++ii){var unif=prog.uniforms[ii]
var value=params[unif.name]||unif.glob
if(!value){continue}var diff=false
for(var jj=0;jj<unif.size;++jj){if(value[jj]!==unif.value[jj]){diff=true
break}}if(diff){for(var _jj=0;_jj<unif.size;++_jj){unif.value[_jj]=value[_jj]}uniformSetValue(unif)}}}function prelink(vp,fp,params,on_error){if(params===void 0){params={}}var prog=autoLink(vp,fp,on_error)
if(prog.valid){bind(vp,fp,params)}return prog.valid}var reserved={WEBGL2:1}
function addReservedDefine(key){reserved[key]=1}var internal_defines={}
function applyDefines(){global_defines=Object.keys(engine.defines).filter(function(v){return!reserved[v]}).concat(Object.keys(internal_defines)).map(function(v){return"#define "+v+"\n"}).join("")}function shaderReload(){shadersRequirePrelink(false)
if(shaders.length){if(reported_shader_errors){errorReportClear()
reported_shader_errors=false}gl.useProgram(null)
for(var ii=0;ii<shaders.length;++ii){var programs=shaders[ii].programs
if(programs){for(var id in programs){gl.deleteProgram(programs[id].handle)}shaders[ii].programs={}}}for(var _ii3=0;_ii3<shaders.length;++_ii3){shaders[_ii3].compile()}texturesUnloadDynamic()}}function handleDefinesChanged(){applyDefines()
shaderReload()}function setInternalDefines(new_values){for(var key in new_values){if(new_values[key]){internal_defines[key]=new_values[key]}else{delete internal_defines[key]}}handleDefinesChanged()}function onShaderChange(filename){shaderReload()}function startup(_globals){applyDefines()
exports.globals=globals=_globals
globals_used={}
error_fp=create("shaders/error.fp")
if(engine.webgl2){error_fp_webgl2=create("shaders/error_gl2.fp")}error_vp=create("shaders/error.vp")
filewatchOn(".fp",onShaderChange)
filewatchOn(".vp",onShaderChange)}function addGlobal(key,vec){assert(!globals[key])
assert(!globals_used[key])
globals[key]=vec
for(var ii=0;ii<vec.length;++ii){assert(isFinite(vec[ii]))}}

},{"../common/util.js":89,"./engine.js":20,"./error_report.js":22,"./filewatch.js":25,"./textures.js":67,"./webfs.js":73,"assert":undefined}],58:[function(require,module,exports){
"use strict"
exports.simpleMenuCreate=simpleMenuCreate
exports.createSimpleMenu=simpleMenuCreate
exports.create=simpleMenuCreate
var assert=require("assert")
var _require=require("../common/util.js"),clamp=_require.clamp
var _require2=require("../common/vmath.js"),vec4=_require2.vec4
var camera2d=require("./camera2d.js")
var engine=require("./engine.js")
var _require3=require("./input.js"),KEYS=_require3.KEYS,PAD=_require3.PAD,keyDown=_require3.keyDown,keyDownEdge=_require3.keyDownEdge,padButtonDownEdge=_require3.padButtonDownEdge
var _require4=require("./selection_box.js"),selectionBoxCreate=_require4.selectionBoxCreate
var _require5=require("./slider.js"),slider=_require5.slider,sliderIsFocused=_require5.sliderIsFocused
var ui=require("./ui.js")
var color101010C8=vec4(16/255,16/255,16/255,200/255)
var GlovSimpleMenu=function(){function GlovSimpleMenu(params){params=params||{}
this.sel_box=selectionBoxCreate(params)
this.edit_index=-1
this.selected=-1}var _proto=GlovSimpleMenu.prototype
_proto.execItem=function execItem(index,delta){var items=this.sel_box.items
assert(index>=0&&index<items.length)
var menu_item=items[index]
var force=false
if(delta===2){delta=1
force=true}if(!menu_item.state){if(menu_item.value!==null&&(menu_item.prompt_int||menu_item.prompt_string)){this.internal.edit_index=index}else if(menu_item.value!==null){if(keyDown(KEYS.SHIFT)&&!force){delta=-1}menu_item.value+=delta*menu_item.value_inc
if(menu_item.slider||menu_item.plus_minus){menu_item.value=clamp(menu_item.value,menu_item.value_min,menu_item.value_max)}else{if(menu_item.value<menu_item.value_min){menu_item.value=menu_item.value_max}if(menu_item.value>menu_item.value_max){menu_item.value=menu_item.value_min}}}else{}}else{engine.setState(menu_item.state)}if(menu_item.cb){menu_item.cb()}}
_proto.run=function run(params){var sel_box=this.sel_box
sel_box.applyParams(params)
sel_box.items[0].auto_focus=true
var items=sel_box.items,x=sel_box.x,z=sel_box.z
var y0=sel_box.y
var exit_index=-1
for(var i=0;i<items.length;++i){if(items[i].exit){exit_index=i}}var selbox_enabled=!(params&&params.disabled)
if(this.edit_index>=0&&this.edit_index<items.length){selbox_enabled=false
ui.drawRect(camera2d.x0(),camera2d.y0(),camera2d.x1(),camera2d.y1(),z+2,color101010C8)}sel_box.disabled=!selbox_enabled
var display=sel_box.display
sel_box.show_as_focused=-1
for(var ii=0;ii<items.length;ii++){var menu_item=items[ii]
if(menu_item.slider){var slider_width=160
var slider_x=x+sel_box.width-slider_width-4-display.xpad
var color=display.style_default.color_vec4
if(menu_item.disabled){color=display.style_disabled.color}menu_item.value=slider(menu_item.value,{x:slider_x,y:y0+ii*sel_box.entry_height,z:z+3,w:slider_width,h:sel_box.entry_height,disabled:menu_item.disabled,color:color,min:menu_item.value_min,max:menu_item.value_max,pad_focusable:false})
if(sliderIsFocused()){sel_box.show_as_focused=ii}}else if(menu_item.plus_minus){assert(typeof menu_item.value==="number","plus_minus items require a numerical value")
assert(menu_item.value_inc,"plus_minus items require a value increment")
var pad=6
var button_width=sel_box.entry_height
var button_x=x+sel_box.width-button_width*2-pad-4
var delta=0
if(ui.buttonText({pad_focusable:false,x:button_x,y:y0+ii*sel_box.entry_height,z:z+3,w:button_width,h:sel_box.entry_height,text:"-"})){delta=-1}var minus_over=ui.button_mouseover
if(ui.buttonText({pad_focusable:false,x:button_x+pad+button_width,y:y0+ii*sel_box.entry_height,z:z+3,w:button_width,h:sel_box.entry_height,text:"+"})){delta=1}var plus_over=ui.button_mouseover
if(delta){menu_item.value+=delta*menu_item.value_inc
menu_item.value=clamp(menu_item.value,menu_item.value_min,menu_item.value_max)}if(minus_over||plus_over){sel_box.show_as_focused=ii}}}var y=y0
y+=sel_box.run()
var selected=-1
if(exit_index!==-1&&(keyDownEdge(KEYS.ESC)||!items[exit_index].no_controller_exit&&padButtonDownEdge(PAD.CANCEL))){this.execItem(exit_index,1)
selected=exit_index}if(sel_box.was_clicked){this.execItem(sel_box.selected,sel_box.was_right_clicked?-1:1)
selected=sel_box.selected}this.selected=selected
if(selected!==-1&&!items[selected].no_sound){if(items[selected].exit){ui.playUISound("cancel")}else{ui.playUISound("select")}}return y-y0}
_proto.isSelected=function isSelected(tag_or_index){if(this.selected===-1){return false}if(tag_or_index===undefined){return this.sel_box.items[this.selected].tag||true}return this.sel_box.isSelected(tag_or_index)}
_proto.getSelectedIndex=function getSelectedIndex(){return this.selected}
_proto.getSelectedItem=function getSelectedItem(){return this.sel_box.items[this.selected]}
return GlovSimpleMenu}()
function simpleMenuCreate(params){return new GlovSimpleMenu(params)}

},{"../common/util.js":89,"../common/vmath.js":91,"./camera2d.js":13,"./engine.js":20,"./input.js":36,"./selection_box.js":54,"./slider.js":59,"./ui.js":69,"assert":undefined}],59:[function(require,module,exports){
"use strict"
exports.slider=slider
exports.sliderIsDragging=sliderIsDragging
exports.sliderIsFocused=sliderIsFocused
exports.sliderSetDefaultShrink=sliderSetDefaultShrink
var _custom_nav
function _extends(){_extends=Object.assign?Object.assign.bind():function(target){for(var i=1;i<arguments.length;i++){var source=arguments[i]
for(var key in source){if(Object.prototype.hasOwnProperty.call(source,key)){target[key]=source[key]}}}return target}
return _extends.apply(this,arguments)}var _assert=require("assert")
var assert=_assert
var round=Math.round,max=Math.max
var _glovCommonUtilJs=require("../common/util.js")
var clamp=_glovCommonUtilJs.clamp
var _glovCommonVmathJs=require("../common/vmath.js")
var vec4=_glovCommonVmathJs.vec4
var _inputJs=require("./input.js")
var input=_inputJs
var _spotJs=require("./spot.js")
var SPOT_DEFAULT_BUTTON=_spotJs.SPOT_DEFAULT_BUTTON
var SPOT_NAV_LEFT=_spotJs.SPOT_NAV_LEFT
var SPOT_NAV_RIGHT=_spotJs.SPOT_NAV_RIGHT
var spot=_spotJs.spot
var _uiJs=require("./ui.js")
var Z_MIN_INC=_uiJs.Z_MIN_INC
var drawHBox=_uiJs.drawHBox
var playUISound=_uiJs.playUISound
var _uiJs2=require("./ui.js")
var ui=_uiJs2
var SPOT_DEFAULT_SLIDER=_extends({},SPOT_DEFAULT_BUTTON,{sound_button:null,custom_nav:(_custom_nav={},_custom_nav[SPOT_NAV_RIGHT]=null,_custom_nav[SPOT_NAV_LEFT]=null,_custom_nav)})
var slider_default_vshrink=1
var slider_default_handle_shrink=1
function sliderSetDefaultShrink(vshrink,handle_shrink){slider_default_vshrink=vshrink
slider_default_handle_shrink=handle_shrink}var color_slider_handle=vec4(1,1,1,1)
var color_slider_handle_grab=vec4(.5,.5,.5,1)
var color_slider_handle_over=vec4(.75,.75,.75,1)
var slider_dragging=false
var slider_focused=false
function sliderIsDragging(){return slider_dragging}function sliderIsFocused(){return slider_focused}function slider(value,param){assert(typeof param.x==="number")
assert(typeof param.y==="number")
assert(param.min<param.max)
param.z=param.z||Z.UI
param.w=param.w||ui.button_width
param.h=param.h||ui.button_height
param.max_dist=param.max_dist||Infinity
var vshrink=param.vshrink||slider_default_vshrink
var handle_shrink=param.handle_shrink||slider_default_handle_shrink
var disabled=param.disabled||false
var handle_h=param.h*handle_shrink
var handle_w=ui.sprites.slider_handle.uidata.wh[0]*handle_h
var pad_focusable=param.pad_focusable
slider_dragging=false
var shrinkdiff=handle_shrink-vshrink
drawHBox({x:param.x+param.h*shrinkdiff/2,y:param.y+param.h*(1-vshrink)/2,z:param.z,w:param.w-param.h*shrinkdiff,h:param.h*vshrink},ui.sprites.slider,param.color)
var xoffs=round(max(ui.sprites.slider.uidata.wh[0]*param.h*vshrink,handle_w)/2)
var draggable_width=param.w-xoffs*2
var drag=!disabled&&input.drag(param)
var grabbed=Boolean(drag)
param.def=SPOT_DEFAULT_SLIDER
if(grabbed){param.focus_steal=true}param.pad_focusable=pad_focusable
var spot_ret=spot(param)
slider_focused=spot_ret.focused
if(spot_ret.ret&&spot_ret.pos){grabbed=false
value=(spot_ret.pos[0]-(param.x+xoffs))/draggable_width
value=param.min+(param.max-param.min)*clamp(value,0,1)
playUISound("button_click")}else if(grabbed){value=(drag.cur_pos[0]-(param.x+xoffs))/draggable_width
value=param.min+(param.max-param.min)*clamp(value,0,1)
input.mouseOver()
slider_dragging=true
slider_focused=true}if(spot_ret.nav){playUISound("button_click")
var step=param.step||(param.max-param.min)/16
if(spot_ret.nav===SPOT_NAV_RIGHT){value=clamp(value+step,param.min,param.max)}else if(spot_ret.nav===SPOT_NAV_LEFT){value=clamp(value-step,param.min,param.max)}}var handle_center_pos=param.x+xoffs+draggable_width*(value-param.min)/(param.max-param.min)
var handle_x=handle_center_pos-handle_w/2
var handle_y=param.y+param.h/2-handle_h/2
var handle_color=color_slider_handle
if(grabbed){handle_color=color_slider_handle_grab}else if(spot_ret.focused){handle_color=color_slider_handle_over}ui.sprites.slider_handle.draw({x:handle_x,y:handle_y,z:param.z+Z_MIN_INC,w:handle_w,h:handle_h,color:handle_color,frame:0})
return value}

},{"../common/util.js":89,"../common/vmath.js":91,"./input.js":36,"./spot.js":63,"./ui.js":69,"assert":undefined}],60:[function(require,module,exports){
"use strict"
exports.friendAdd=friendAdd
exports.friendBlock=friendBlock
exports.friendIsBlocked=friendIsBlocked
exports.friendRemove=friendRemove
exports.friendUnblock=friendUnblock
exports.friendsGet=friendsGet
exports.getExternalCurrentUserInfos=getExternalCurrentUserInfos
exports.getExternalFriendInfos=getExternalFriendInfos
exports.getExternalUserInfos=getExternalUserInfos
exports.getUserProfileImage=getUserProfileImage
exports.isFriend=isFriend
exports.registerExternalUserInfoProvider=registerExternalUserInfoProvider
exports.richPresenceSet=richPresenceSet
exports.setDefaultUserProfileImage=setDefaultUserProfileImage
exports.socialInit=socialInit
var assert=require("assert")
var _glovClientClient_config=require("./client_config")
var PLATFORM_FBINSTANT=_glovClientClient_config.PLATFORM_FBINSTANT
var _glovCommonEnums=require("../common/enums")
var ID_PROVIDER_FB_GAMING=_glovCommonEnums.ID_PROVIDER_FB_GAMING
var ID_PROVIDER_FB_INSTANT=_glovCommonEnums.ID_PROVIDER_FB_INSTANT
var PRESENCE_ACTIVE=_glovCommonEnums.PRESENCE_ACTIVE
var PRESENCE_INACTIVE=_glovCommonEnums.PRESENCE_INACTIVE
var PRESENCE_OFFLINE=_glovCommonEnums.PRESENCE_OFFLINE
var _glovCommonFriends_data=require("../common/friends_data")
var FriendStatus=_glovCommonFriends_data.FriendStatus
var _glovCommonUtil=require("../common/util")
var deepEqual=_glovCommonUtil.deepEqual
var _cmds=require("./cmds")
var cmd_parse=_cmds.cmd_parse
var _input=require("./input")
var input=_input
var _net=require("./net")
var netDisconnected=_net.netDisconnected
var netSubs=_net.netSubs
var _sprites=require("./sprites")
var sprites=_sprites
var _textures=require("./textures")
var textures=_textures
var IDLE_TIME=6e4
var friend_list=null
function friendsGet(){var _friend_list
return(_friend_list=friend_list)!=null?_friend_list:Object.create(null)}function isFriend(user_id){var _friend_list2
var value=(_friend_list2=friend_list)==null?void 0:_friend_list2[user_id]
return(value==null?void 0:value.status)===FriendStatus.Added||(value==null?void 0:value.status)===FriendStatus.AddedAuto}function friendIsBlocked(user_id){var _friend_list3
var value=(_friend_list3=friend_list)==null?void 0:_friend_list3[user_id]
return(value==null?void 0:value.status)===FriendStatus.Blocked}function makeFriendCmdRequest(cmd,user_id,cb){user_id=user_id.toLowerCase()
var requesting_user_id=netSubs().loggedIn()
if(netDisconnected()){return void cb("ERR_DISCONNECTED")}netSubs().getMyUserChannel().cmdParse(cmd+" "+user_id,function(err,resp){if(err){return void cb(err)}else if(requesting_user_id!==netSubs().loggedIn()||!friend_list){return void cb("Invalid data")}if(resp.friend){friend_list[user_id]=resp.friend}else{delete friend_list[user_id]}cb(null,resp.msg)})}function friendAdd(user_id,cb){makeFriendCmdRequest("friend_add",user_id,cb)}function friendRemove(user_id,cb){makeFriendCmdRequest("friend_remove",user_id,cb)}function friendBlock(user_id,cb){makeFriendCmdRequest("friend_block",user_id,cb)}function friendUnblock(user_id,cb){makeFriendCmdRequest("friend_unblock",user_id,cb)}cmd_parse.register({cmd:"friend_add",help:"Add a friend",func:friendAdd})
cmd_parse.register({cmd:"friend_remove",help:"Remove a friend",func:friendRemove})
cmd_parse.register({cmd:"friend_block",help:"Block someone from seeing your rich presence, also removes from your friends list",func:friendBlock})
cmd_parse.register({cmd:"friend_unblock",help:"Reset a user to allow seeing your rich presence again",func:friendUnblock})
cmd_parse.register({cmd:"friend_list",help:"List all friends",func:function func(str,resp_func){if(!friend_list){return void resp_func("Friends list not loaded")}resp_func(null,Object.keys(friend_list).filter(isFriend).join(",")||"You have no friends")}})
cmd_parse.register({cmd:"friend_block_list",help:"List all blocked users",func:function func(str,resp_func){if(!friend_list){return void resp_func("Friends list not loaded")}resp_func(null,Object.keys(friend_list).filter(friendIsBlocked).join(",")||"You have no blocked users")}})
var invisible=0
cmd_parse.registerValue("invisible",{type:cmd_parse.TYPE_INT,help:"Hide rich presence information from other users",label:"Invisible",range:[0,1],get:function get(){return invisible},set:function set(v){return invisible=v}})
var afk=0
cmd_parse.registerValue("afk",{type:cmd_parse.TYPE_INT,help:"Appear as idle to other users",label:"AFK",range:[0,1],get:function get(){return afk},set:function set(v){return afk=v}})
function onPresence(data){var user_channel=this
user_channel.presence_data=data}var last_presence=null
var send_queued=false
function richPresenceSend(){if(!netSubs().loggedIn()||!last_presence||send_queued){return}send_queued=true
netSubs().onceConnected(function(){send_queued=false
if(!netSubs().loggedIn()||!last_presence){return}var pak=netSubs().getMyUserChannel().pak("presence_set")
pak.writeInt(last_presence.active)
pak.writeAnsiString(last_presence.state)
pak.writeJSON(last_presence.payload)
pak.send()})}function richPresenceSet(active,state,payload){active=!active||afk||Date.now()-input.inputLastTime()>IDLE_TIME?PRESENCE_INACTIVE:PRESENCE_ACTIVE
if(invisible){active=PRESENCE_OFFLINE}payload=payload||null
if(!last_presence||active!==last_presence.active||state!==last_presence.state||!deepEqual(last_presence.payload,payload)){last_presence={active:active,state:state,payload:payload}
richPresenceSend()}}var external_current_users=Object.create(null)
var external_friends=Object.create(null)
function getExternalCurrentUserInfos(){return external_current_users}function getExternalFriendInfos(user_id){return external_friends[user_id]}function getExternalUserInfos(user_id){if(user_id===netSubs().loggedIn()){return getExternalCurrentUserInfos()}else{return getExternalFriendInfos(user_id)}}function setExternalCurrentUser(provider,user_info){if(user_info){external_current_users[provider]=user_info}else{delete external_current_users[provider]}}function updateExternalFriendsOnServer(provider,to_add,to_remove){if(to_add.length===0&&to_remove.length===0||netDisconnected()){return}var requesting_user_id=netSubs().loggedIn()
var pak=netSubs().getMyUserChannel().pak("friend_auto_update")
pak.writeAnsiString(provider)
for(var ii=0;ii<to_add.length;++ii){pak.writeAnsiString(to_add[ii].external_id)}pak.writeAnsiString("")
for(var _ii=0;_ii<to_remove.length;++_ii){pak.writeAnsiString(to_remove[_ii])}pak.writeAnsiString("")
pak.send(function(err,resp){if(requesting_user_id!==netSubs().loggedIn()||!friend_list){return}else if(err){return}else if(!resp){return}var friends_external_to_user_ids=Object.create(null)
for(var user_id in resp){var friend=friend_list[user_id]=resp[user_id]
if(friend.ids){var external_id=friend.ids[provider]
friends_external_to_user_ids[external_id]=user_id}}to_add.forEach(function(provider_friend){var external_id=provider_friend.external_id
var user_id=friends_external_to_user_ids[external_id]
if(user_id){var external_friend_infos=external_friends[user_id]
if(!external_friend_infos){external_friend_infos=external_friends[user_id]=Object.create(null)}external_friend_infos[provider]=provider_friend}})})}function setExternalFriends(provider,provider_friends){var friends_external_to_user_ids=Object.create(null)
for(var user_id in friend_list){var _friend$ids
var friend=friend_list[user_id]
var external_id=(_friend$ids=friend.ids)==null?void 0:_friend$ids[provider]
if(external_id){friends_external_to_user_ids[external_id]=user_id}}for(var _user_id in external_friends){delete external_friends[_user_id][provider]}var to_add=[]
provider_friends.forEach(function(provider_friend){var external_id=provider_friend.external_id
var user_id=friends_external_to_user_ids[external_id]
if(user_id){var external_friend_infos=external_friends[user_id]
if(!external_friend_infos){external_friend_infos=external_friends[user_id]=Object.create(null)}external_friend_infos[provider]=provider_friend
delete friends_external_to_user_ids[external_id]}else{to_add.push(provider_friend)}})
var to_remove=[]
for(var _external_id in friends_external_to_user_ids){to_remove.push(_external_id)}if(to_add.length!==0||to_remove.length!==0){updateExternalFriendsOnServer(provider,to_add,to_remove)}}function requestExternalCurrentUser(provider,request_func){var requesting_user_id=netSubs().loggedIn()
request_func(function(err,user_info){if(requesting_user_id!==netSubs().loggedIn()){return}else if(err||!user_info){return}setExternalCurrentUser(provider,user_info)})}function requestExternalFriends(provider,request_func){var requesting_user_id=netSubs().loggedIn()
request_func(function(err,friends){if(requesting_user_id!==netSubs().loggedIn()||!friend_list){return}else if(err||!friends){return}setExternalFriends(provider,friends)})}var profile_images={}
var default_profile_image=null
function getUserProfileImage(user_id){var image=profile_images[user_id]
if(image){return image}var url=null
if(PLATFORM_FBINSTANT){var _getExternalUserInfos,_getExternalUserInfos2
url=(_getExternalUserInfos=getExternalUserInfos(user_id))==null?void 0:(_getExternalUserInfos2=_getExternalUserInfos[ID_PROVIDER_FB_INSTANT])==null?void 0:_getExternalUserInfos2.profile_picture_url}else{var _getExternalUserInfos3,_getExternalUserInfos4
url=(_getExternalUserInfos3=getExternalUserInfos(user_id))==null?void 0:(_getExternalUserInfos4=_getExternalUserInfos3[ID_PROVIDER_FB_GAMING])==null?void 0:_getExternalUserInfos4.profile_picture_url}if(url){var tex=textures.load({url:url,filter_min:gl.LINEAR_MIPMAP_LINEAR,filter_mag:gl.LINEAR,soft_error:true,auto_unload:function auto_unload(){return delete profile_images[user_id]}})
if(tex&&tex.loaded){image=profile_images[user_id]={img:sprites.create({tex:tex})}
return image}}return default_profile_image}function setDefaultUserProfileImage(image){default_profile_image=image}var external_user_info_providers=Object.create(null)
function registerExternalUserInfoProvider(provider,get_current_user,get_friends){if(get_current_user||get_friends){var _netSubs
assert(!friend_list)
assert(!((_netSubs=netSubs())!=null&&_netSubs.loggedIn()))
external_user_info_providers[provider]={get_current_user:get_current_user,get_friends:get_friends}}else{delete external_user_info_providers[provider]}}function socialInit(){netSubs().on("login",function(){var user_channel=netSubs().getMyUserChannel()
var user_id=netSubs().loggedIn()
richPresenceSend()
friend_list=null
if(netDisconnected()){return}user_channel.pak("friend_list").send(function(err,resp){if(err||user_id!==netSubs().loggedIn()){return}friend_list=resp
for(var provider in external_user_info_providers){var _external_user_info_p=external_user_info_providers[provider],get_current_user=_external_user_info_p.get_current_user,get_friends=_external_user_info_p.get_friends
if(get_current_user){requestExternalCurrentUser(provider,get_current_user)}if(get_friends){requestExternalFriends(provider,get_friends)}}})})
netSubs().on("logout",function(){friend_list=null
external_current_users=Object.create(null)
external_friends=Object.create(null)})
netSubs().onChannelMsg("user","presence",onPresence)}

},{"../common/enums":82,"../common/friends_data":83,"../common/util":89,"./client_config":15,"./cmds":16,"./input":36,"./net":43,"./sprites":65,"./textures":67,"assert":undefined}],61:[function(require,module,exports){
"use strict"
exports.FADE_OUT=exports.FADE_IN=exports.FADE_DEFAULT=exports.FADE=void 0
exports.soundLoad=soundLoad
exports.soundLoading=soundLoading
exports.soundOnLoadFail=soundOnLoadFail
exports.soundPause=soundPause
exports.soundPlay=soundPlay
exports.soundPlayMusic=soundPlayMusic
exports.soundPlayStreaming=soundPlayStreaming
exports.soundResume=soundResume
exports.soundResumed=soundResumed
exports.soundStartup=soundStartup
exports.soundTick=soundTick
var FADE_DEFAULT=0
exports.FADE_DEFAULT=FADE_DEFAULT
var FADE_OUT=1
exports.FADE_OUT=FADE_OUT
var FADE_IN=2
exports.FADE_IN=FADE_IN
var FADE=FADE_OUT+FADE_IN
exports.FADE=FADE
var assert=require("assert")
var _glovCommonUtil=require("../common/util")
var callEach=_glovCommonUtil.callEach
var defaults=_glovCommonUtil.defaults
var ridx=_glovCommonUtil.ridx
var _browser=require("./browser")
var is_firefox=_browser.is_firefox
var _cmds=require("./cmds")
var cmd_parse=_cmds.cmd_parse
var _fbinstant=require("./fbinstant")
var fbInstantOnPause=_fbinstant.fbInstantOnPause
var _filewatch=require("./filewatch")
var filewatchOn=_filewatch.filewatchOn
var _urlhash=require("./urlhash")
var urlhash=_urlhash
var _require=require("@jimbly/howler/src/howler.core.js"),Howl=_require.Howl,Howler=_require.Howler
var settings=require("./settings")
var abs=Math.abs,floor=Math.floor,max=Math.max,min=Math.min,random=Math.random
var DEFAULT_FADE_RATE=.001
var sounds={}
var active_sfx_as_music=[]
var num_loading=0
var default_params={ext_list:["mp3","wav"],fade_rate:DEFAULT_FADE_RATE}
var sound_params
var last_played={}
var frame_timestamp=0
var fades=[]
var music
var volume_override=1
var volume_override_target=1
settings.register({volume:{default_value:1,type:cmd_parse.TYPE_FLOAT,range:[0,1]}})
settings.register({volume_music:{default_value:1,type:cmd_parse.TYPE_FLOAT,range:[0,1]}})
settings.register({volume_sound:{default_value:1,type:cmd_parse.TYPE_FLOAT,range:[0,1]}})
settings.register({sound:{default_value:1,type:cmd_parse.TYPE_INT,range:[0,1]}})
settings.register({music:{default_value:1,type:cmd_parse.TYPE_INT,range:[0,1]}})
function musicVolume(){return settings.volume*settings.volume_music}function soundVolume(){return settings.volume*settings.volume_sound}var sounds_loading={}
var on_load_fail
function soundOnLoadFail(cb){on_load_fail=cb}function soundLoad(soundid,opts,cb){opts=opts||{}
if(opts.streaming&&is_firefox){opts.streaming=false}if(Array.isArray(soundid)){assert(!cb)
for(var ii=0;ii<soundid.length;++ii){soundLoad(soundid[ii],opts)}return}var key=typeof soundid==="string"?soundid:soundid.file
if(sounds[key]){if(cb){cb()}return}if(sounds_loading[key]){if(cb){sounds_loading[key].push(cb)}return}var cbs=[]
if(cb){cbs.push(cb)}sounds_loading[key]=cbs
var soundname=key
var m=soundname.match(/^((?:[\0-\t\x0B\f\x0E-\u2027\u202A-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])*)\.(mp3|ogg|wav|webm)$/)
var preferred_ext
if(m){soundname=m[1]
preferred_ext=m[2]}var src="sounds/"+soundname
var srcs=[]
var suffix=""
if(opts.for_reload){suffix="?rl="+Date.now()}if(preferred_ext){srcs.push(""+urlhash.getURLBase()+src+"."+preferred_ext+suffix)}for(var _ii=0;_ii<sound_params.ext_list.length;++_ii){var ext=sound_params.ext_list[_ii]
if(ext!==preferred_ext){srcs.push(""+urlhash.getURLBase()+src+"."+ext+suffix)}}function tryLoad(idx){if(idx===srcs.length){console.error("Error loading sound "+soundname+": All fallbacks exhausted, giving up")
if(on_load_fail){on_load_fail(soundname)}callEach(cbs,delete sounds_loading[key],"Error loading sound")
return}if(!opts.streaming){++num_loading}var once=false
var sound=new Howl({src:srcs.slice(idx),html5:Boolean(opts.streaming),loop:Boolean(opts.loop),volume:0,onload:function onload(){if(!once){if(!opts.streaming){--num_loading}once=true
sound.glov_load_opts=opts
sounds[key]=sound
callEach(cbs,delete sounds_loading[key],null)}},onloaderror:function onloaderror(id,err,extra){if(idx===srcs.length-1){console.error("Error loading sound "+srcs[idx]+": "+err)}else{console.log("Error loading sound "+srcs[idx]+": "+err+", trying fallback...")}if(!once){if(!opts.streaming){--num_loading}once=true
tryLoad(idx+1)}}})}tryLoad(0)}function soundReload(filename){var name_match=filename.match(/^sounds\/([^.]+)\.\w+$/)
var sound_name=name_match&&name_match[1]
if(!sound_name){return}if(!sounds[sound_name]){console.log("Reload trigged for non-existent sound: "+filename)
return}var opts=sounds[sound_name].glov_load_opts
opts.for_reload=true
delete sounds[sound_name]
soundLoad(sound_name,opts)}function soundPause(){volume_override=volume_override_target=0
soundTick(0)}function soundResume(){volume_override_target=1
Howler.manualUnlock()}function soundStartup(params){sound_params=defaults(params||{},default_params)
music=[]
for(var ii=0;ii<2;++ii){music.push({sound:null,id:0,current_volume:0,target_volume:0,sys_volume:0,need_play:false})}filewatchOn(".mp3",soundReload)
filewatchOn(".ogg",soundReload)
filewatchOn(".wav",soundReload)
filewatchOn(".webm",soundReload)
fbInstantOnPause(soundPause)}function soundResumed(){return!Howler.noAudio&&Howler.safeToPlay}function soundTick(dt){frame_timestamp+=dt
if(volume_override!==volume_override_target){var delta=dt*.004
if(volume_override<volume_override_target){volume_override=min(volume_override+delta,volume_override_target)}else{volume_override=max(volume_override-delta,volume_override_target)}}if(!soundResumed()){return}for(var i=0;i<active_sfx_as_music.length;++i){var _active_sfx_as_music$=active_sfx_as_music[i],sound=_active_sfx_as_music$.sound,play_volume=_active_sfx_as_music$.play_volume,set_volume_when_played=_active_sfx_as_music$.set_volume_when_played
if(!sound.playing()){ridx(active_sfx_as_music,i)}else if(set_volume_when_played!==musicVolume()){sound.volume(play_volume)
active_sfx_as_music[i].set_volume_when_played=musicVolume()}}var max_fade=dt*sound_params.fade_rate
for(var ii=0;ii<music.length;++ii){var mus=music[ii]
if(!mus.sound){continue}var target=settings.music?mus.target_volume:0
if(mus.current_volume!==target){var _delta=target-mus.current_volume
var fade_amt=min(abs(_delta),max_fade)
if(_delta<0){mus.current_volume=max(target,mus.current_volume-fade_amt)}else{mus.current_volume=min(target,mus.current_volume+fade_amt)}if(!mus.target_volume&&!mus.current_volume){if(!mus.need_play){mus.sound.stop(mus.id)}mus.sound=null}}if(mus.sound){var sys_volume=mus.current_volume*musicVolume()*volume_override
if(mus.need_play){mus.need_play=false
mus.id=mus.sound.play()
mus.sys_volume=-1}if(mus.sys_volume!==sys_volume){mus.sound.volume(sys_volume,mus.id)
mus.sys_volume=sys_volume}}}for(var _ii2=fades.length-1;_ii2>=0;--_ii2){var fade=fades[_ii2]
var _fade_amt=fade.time?dt/fade.time:max_fade
fade.volume=max(0,fade.volume-_fade_amt)
fade.sound.volume(fade.volume*fade.settingsVolume()*volume_override,fade.id)
if(!fade.volume){fade.sound.stop(fade.id)
ridx(fades,_ii2)}}}function soundPlay(soundid,volume_in,as_music){var volume=volume_in||1
if(!as_music&&!settings.sound||as_music&&!settings.music){return null}if(!soundResumed()){return null}if(Array.isArray(soundid)){soundid=soundid[floor(random()*soundid.length)]}if(typeof soundid==="object"){volume*=soundid.volume||1
soundid=soundid.file}var sound=sounds[soundid]
if(!sound){return null}var last_played_time=last_played[soundid]||-9e9
if(frame_timestamp-last_played_time<45){return null}var settingsVolume=as_music?musicVolume:soundVolume
var id=sound.play(undefined,volume*settingsVolume()*volume_override)
last_played[soundid]=frame_timestamp
var played_sound={stop:sound.stop.bind(sound,id),playing:sound.playing.bind(sound,id),location:function location(){var v=sound.seek(id)
if(typeof v!=="number"){return 0}return v},duration:sound.duration.bind(sound,id),volume:function volume(vol){sound.volume(vol*settingsVolume()*volume_override,id)},fadeOut:function fadeOut(time){fades.push({volume:volume,sound:sound,id:id,time:time,settingsVolume:settingsVolume})}}
if(as_music){active_sfx_as_music.push({sound:played_sound,play_volume:volume,set_volume_when_played:musicVolume()})}return played_sound}function soundPlayStreaming(soundname,volume){if(!settings.sound){return}if(Array.isArray(soundname)){soundname=soundname[floor(random()*soundname.length)]}soundLoad(soundname,{streaming:true,loop:false},function(err){if(!err){soundPlay(soundname,volume)}})}function soundPlayMusic(soundname,volume,transition){if(!settings.music){return}if(volume===undefined){volume=1}transition=transition||FADE_DEFAULT
soundLoad(soundname,{streaming:true,loop:true},function(err){assert(!err)
var sound=sounds[soundname]
assert(sound)
if(music[0].sound===sound){music[0].target_volume=volume
if(!transition){if(!volume){sound.stop(music[0].id)
music[0].sound=null}else{var sys_volume=music[0].sys_volume=volume*musicVolume()*volume_override
sound.volume(sys_volume,music[0].id)
if(!sound.playing()){sound.play(undefined,sys_volume)}}}return}if(music[0].current_volume){if(transition&FADE_OUT){var temp=music[1]
music[1]=music[0]
music[0]=temp
music[1].target_volume=0}}if(music[0].sound){music[0].sound.stop(music[0].id)}music[0].sound=sound
music[0].target_volume=volume
var start_vol=transition&FADE_IN?0:volume
music[0].current_volume=start_vol
if(soundResumed()){var _sys_volume=start_vol*musicVolume()*volume_override
music[0].id=sound.play(undefined,_sys_volume)
music[0].sys_volume=_sys_volume
music[0].need_play=false}else{music[0].need_play=true}})}function soundLoading(){return num_loading}

},{"../common/util":89,"./browser":11,"./cmds":16,"./fbinstant":23,"./filewatch":25,"./settings":55,"./urlhash":71,"@jimbly/howler/src/howler.core.js":undefined,"assert":undefined}],62:[function(require,module,exports){
"use strict"
exports.spineCreate=spineCreate
var _assert=require("assert")
var assert=_assert
var _glovClientSpritesJs=require("./sprites.js")
var BLEND_ADDITIVE=_glovClientSpritesJs.BLEND_ADDITIVE
var BLEND_ALPHA=_glovClientSpritesJs.BLEND_ALPHA
var queueSpriteData=_glovClientSpritesJs.queueSpriteData
var spriteDataAlloc=_glovClientSpritesJs.spriteDataAlloc
var _spineCoreAnimationState=require("spine-core/AnimationState")
var AnimationState=_spineCoreAnimationState.AnimationState
var _spineCoreAnimationStateData=require("spine-core/AnimationStateData")
var AnimationStateData=_spineCoreAnimationStateData.AnimationStateData
var _spineCoreAtlasAttachmentLoader=require("spine-core/AtlasAttachmentLoader")
var AtlasAttachmentLoader=_spineCoreAtlasAttachmentLoader.AtlasAttachmentLoader
var _spineCoreClippingAttachment=require("spine-core/ClippingAttachment")
var ClippingAttachment=_spineCoreClippingAttachment.ClippingAttachment
var _spineCoreMeshAttachment=require("spine-core/MeshAttachment")
var MeshAttachment=_spineCoreMeshAttachment.MeshAttachment
var _spineCoreRegionAttachment=require("spine-core/RegionAttachment")
var RegionAttachment=_spineCoreRegionAttachment.RegionAttachment
var _spineCoreSkeleton=require("spine-core/Skeleton")
var Skeleton=_spineCoreSkeleton.Skeleton
var _spineCoreSkeletonBinary=require("spine-core/SkeletonBinary")
var SkeletonBinary=_spineCoreSkeletonBinary.SkeletonBinary
var _spineCoreSlotData=require("spine-core/SlotData")
var BlendMode=_spineCoreSlotData.BlendMode
var _spineCoreTextureAtlas=require("spine-core/TextureAtlas")
var TextureAtlas=_spineCoreTextureAtlas.TextureAtlas
var _spineCoreUtils=require("spine-core/Utils")
var Color=_spineCoreUtils.Color
var Vector2=_spineCoreUtils.Vector2
var _texturesJs=require("./textures.js")
var textureLoad=_texturesJs.textureLoad
var _webfsJs=require("./webfs.js")
var webFSGetFile=_webfsJs.webFSGetFile
function SpineTexture(texture){this.texture=texture
this.texs=[this.texture]}SpineTexture.prototype.setFilters=function(filter_min,filter_mag){this.texture.setSamplerState({filter_min:filter_min,filter_mag:filter_mag,wrap_s:gl.CLAMP_TO_EDGE,wrap_t:gl.CLAMP_TO_EDGE})}
SpineTexture.prototype.setWraps=function(wrap_s,wrap_t){assert.equal(this.texture.wrap_s,wrap_s)
assert.equal(this.texture.wrap_t,wrap_t)}
SpineTexture.prototype.getImage=function(){assert(false)
return{width:this.width,height:this.height}}
var atlases={}
function spineLoadAtlas(filename){if(atlases[filename]){return atlases[filename]}var atlas_text=webFSGetFile(filename,"text")
var parent=filename.match(/(.*\/)[^/]+/)[1]
var atlas
try{atlases[filename]=atlas=new TextureAtlas(atlas_text)}catch(e){throw new Error("Couldn't parse texture atlas "+filename+": "+e.message)}for(var ii=0;ii<atlas.pages.length;++ii){var page=atlas.pages[ii]
page.setTexture(new SpineTexture(textureLoad({url:""+parent+page.name,wrap_s:gl.CLAMP_TO_EDGE,wrap_t:gl.CLAMP_TO_EDGE})))}return atlases[filename]=atlas}var skeletons={}
function spineLoadSkeleton(atlas,params){var filename=params.skel,mix=params.mix
if(skeletons[filename]){return skeletons[filename]}var atlas_loader=new AtlasAttachmentLoader(atlas)
var is_json=filename.endsWith(".json")
var skeleton_data
if(is_json){assert(false)}else{var skeleton_binary=new SkeletonBinary(atlas_loader)
skeleton_binary.scale=1
skeleton_data=skeleton_binary.readSkeletonData(webFSGetFile(filename,"binary"))}var skeleton=new Skeleton(skeleton_data)
var animation_state_data=new AnimationStateData(skeleton_data)
for(var from in mix){var map=mix[from]
for(var to in map){var v=map[to]
animation_state_data.setMix(from,to,v)
if(!mix[to]||mix[to][from]===undefined){animation_state_data.setMix(to,from,v)}}}return skeletons[filename]={skeleton:skeleton,animation_state_data:animation_state_data}}var tempPos=new Vector2
var tempUv=new Vector2
var tempLight=new Color
var tempDark=new Color
var finalColor=new Color
var tempColor2=new Color
function Spine(params){var anim=params.anim
var atlas=spineLoadAtlas(params.atlas)
var _spineLoadSkeleton=spineLoadSkeleton(atlas,params),skeleton=_spineLoadSkeleton.skeleton,animation_state_data=_spineLoadSkeleton.animation_state_data
this.skeleton=skeleton
this.animation_state=new AnimationState(animation_state_data)
this.vertices=new Float32Array(1024)
if(anim){this.setAnimation(0,anim,true)}}Spine.prototype.getAnimation=function(track_index){track_index=track_index||0
var cur=this.animation_state.getCurrent(track_index)
return cur&&cur.animation&&cur.animation.name||null}
Spine.prototype.setAnimation=function(track_index,name,loop){var cur=this.animation_state.getCurrent(track_index)
if(cur&&cur.animation&&cur.animation.name===name){return}this.animation_state.setAnimation(track_index,name,loop)}
Spine.prototype.update=function(dt){this.animation_state.update(dt/1e3)
this.animation_state.apply(this.skeleton)
this.skeleton.updateWorldTransform()}
var match_a=[-1,-1,-1]
var match_b=[0,0,0]
var QUAD_TRIANGLES=[0,1,2,2,3,0]
var ZINC=.001
Spine.prototype.draw=function(param){var x=param.x,y=param.y,z=param.z,scale=param.scale
if(scale===undefined){scale=1}var skeleton=this.skeleton,vertices=this.vertices
var drawOrder=skeleton.drawOrder
var skeletonColor=skeleton.color
var vertexSize=2
var clippedVertexSize=vertexSize
var premultipliedAlpha=false
var texture
var uvs
var blend
var lookup=[]
function doQuad(v0,v1,v2,v3){lookup[0]=v0
lookup[1]=v1
lookup[2]=v2
lookup[3]=v3
var sprite=spriteDataAlloc(texture.texs,null,null,blend)
var buf=sprite.data
for(var corner=0,vout=0;corner<4;corner++){var vin=lookup[corner]*2
buf[vout++]=x+vertices[vin]*scale
buf[vout++]=y-vertices[vin+1]*scale
buf[vout++]=finalColor.r
buf[vout++]=finalColor.g
buf[vout++]=finalColor.b
buf[vout++]=finalColor.a
buf[vout++]=uvs[vin]
buf[vout++]=uvs[vin+1]}queueSpriteData(sprite,z)
z+=ZINC}for(var i=0;i<drawOrder.length;i++){var slot=drawOrder[i]
if(!slot.bone.active){continue}var attachment=slot.getAttachment()
var numVertices=void 0
var triangles=void 0
var attachmentColor=void 0
if(attachment instanceof RegionAttachment){var region=attachment
numVertices=4
region.computeWorldVertices(slot.bone,vertices,0,clippedVertexSize)
triangles=QUAD_TRIANGLES
uvs=region.uvs
texture=region.region.renderObject.page.texture
attachmentColor=region.color}else if(attachment instanceof MeshAttachment){var mesh=attachment
numVertices=mesh.worldVerticesLength>>1
var numFloats=numVertices*clippedVertexSize
if(numFloats>vertices.length){vertices=this.vertices=new Float32Array(numFloats)}mesh.computeWorldVertices(slot,0,mesh.worldVerticesLength,vertices,0,clippedVertexSize)
triangles=mesh.triangles
texture=mesh.region.renderObject.page.texture
uvs=mesh.uvs
attachmentColor=mesh.color}else if(attachment instanceof ClippingAttachment){continue}else{continue}if(!texture){continue}var slotColor=slot.color
finalColor.r=skeletonColor.r*slotColor.r*attachmentColor.r
finalColor.g=skeletonColor.g*slotColor.g*attachmentColor.g
finalColor.b=skeletonColor.b*slotColor.b*attachmentColor.b
finalColor.a=skeletonColor.a*slotColor.a*attachmentColor.a
if(premultipliedAlpha){finalColor.r*=finalColor.a
finalColor.g*=finalColor.a
finalColor.b*=finalColor.a}var darkColor=tempColor2
if(!slot.darkColor){darkColor.set(0,0,0,1)}else{if(premultipliedAlpha){darkColor.r=slot.darkColor.r*finalColor.a
darkColor.g=slot.darkColor.g*finalColor.a
darkColor.b=slot.darkColor.b*finalColor.a}else{darkColor.setFromColor(slot.darkColor)}darkColor.a=premultipliedAlpha?1:0}var slotBlendMode=slot.data.blendMode
blend=BLEND_ALPHA
if(slotBlendMode===BlendMode.Additive){blend=BLEND_ADDITIVE}{var verts=vertices
if(this.vertexEffect){var vertexEffect=this.vertexEffect
for(var v=0;v<numVertices*2;v+=2){tempPos.x=verts[v]
tempPos.y=verts[v+1]
tempUv.x=uvs[v]
tempUv.y=uvs[v+1]
tempLight.setFromColor(finalColor)
tempDark.set(0,0,0,0)
vertexEffect.transform(tempPos,tempUv,tempLight,tempDark)
assert(false,"Not yet implemented")}}else{if(numVertices===4){var sprite=spriteDataAlloc(texture.texs,null,null,blend)
var buf=sprite.data
for(var vin=0,vout=0;vin<numVertices*2;vin+=2){buf[vout++]=x+verts[vin]*scale
buf[vout++]=y-verts[vin+1]*scale
buf[vout++]=finalColor.r
buf[vout++]=finalColor.g
buf[vout++]=finalColor.b
buf[vout++]=finalColor.a
buf[vout++]=uvs[vin]
buf[vout++]=uvs[vin+1]}queueSpriteData(sprite,z)
z+=ZINC}else{for(var tri_idx=0;tri_idx<triangles.length;){match_b[0]=match_b[1]=match_b[2]=0
var ti_b=tri_idx+3
var num_match=0
for(var ii=0;ii<3;++ii){match_a[ii]=-1
for(var jj=0;jj<3;++jj){if(triangles[tri_idx+ii]===triangles[ti_b+jj]){++num_match
match_a[ii]=jj
match_b[jj]=1
break}}}if(num_match===2){var unmatchedA=match_a[0]===-1?0:match_a[1]===-1?1:2
var unmatchedB=match_b[0]?match_b[1]?2:1:0
doQuad(triangles[tri_idx+unmatchedA],triangles[tri_idx+(unmatchedA+1)%3],triangles[ti_b+unmatchedB],triangles[tri_idx+(unmatchedA+2)%3])
tri_idx+=6}else{doQuad(triangles[tri_idx],triangles[tri_idx+1],triangles[tri_idx+1],triangles[tri_idx+2])
tri_idx+=3}}}}}}}
function spineCreate(params){return new Spine(params)}

},{"./sprites.js":65,"./textures.js":67,"./webfs.js":73,"assert":undefined,"spine-core/AnimationState":undefined,"spine-core/AnimationStateData":undefined,"spine-core/AtlasAttachmentLoader":undefined,"spine-core/ClippingAttachment":undefined,"spine-core/MeshAttachment":undefined,"spine-core/RegionAttachment":undefined,"spine-core/Skeleton":undefined,"spine-core/SkeletonBinary":undefined,"spine-core/SlotData":undefined,"spine-core/TextureAtlas":undefined,"spine-core/Utils":undefined}],63:[function(require,module,exports){
"use strict"
exports.SPOT_STATE_REGULAR=exports.SPOT_STATE_FOCUSED=exports.SPOT_STATE_DOWN=exports.SPOT_STATE_DISABLED=exports.SPOT_NAV_UP=exports.SPOT_NAV_RIGHT=exports.SPOT_NAV_PREV=exports.SPOT_NAV_NONE=exports.SPOT_NAV_NEXT=exports.SPOT_NAV_LEFT=exports.SPOT_NAV_DOWN=exports.SPOT_DEFAULT_LABEL=exports.SPOT_DEFAULT_BUTTON_DRAW_ONLY=exports.SPOT_DEFAULT_BUTTON_DISABLED=exports.SPOT_DEFAULT_BUTTON=exports.SPOT_DEFAULT=exports.BUTTON_ANY=void 0
exports.spot=spot
exports.spotCanvasHandles=spotCanvasHandles
exports.spotEndInput=spotEndInput
exports.spotEndOfFrame=spotEndOfFrame
exports.spotFocusCheck=spotFocusCheck
exports.spotFocusSteal=spotFocusSteal
exports.spotFocusableCanvas=spotFocusableCanvas
exports.spotKey=spotKey
exports.spotMouseoverHook=spotMouseoverHook
exports.spotPadMode=spotPadMode
exports.spotSubBegin=spotSubBegin
exports.spotSubEnd=spotSubEnd
exports.spotSubPop=spotSubPop
exports.spotSubPush=spotSubPush
exports.spotTopOfFrame=spotTopOfFrame
exports.spotUnfocus=spotUnfocus
exports.spotlog=spotlog
function _extends(){_extends=Object.assign?Object.assign.bind():function(target){for(var i=1;i<arguments.length;i++){var source=arguments[i]
for(var key in source){if(Object.prototype.hasOwnProperty.call(source,key)){target[key]=source[key]}}}return target}
return _extends.apply(this,arguments)}var SPOT_NAV_NONE=0
exports.SPOT_NAV_NONE=SPOT_NAV_NONE
var SPOT_NAV_LEFT=1
exports.SPOT_NAV_LEFT=SPOT_NAV_LEFT
var SPOT_NAV_UP=2
exports.SPOT_NAV_UP=SPOT_NAV_UP
var SPOT_NAV_RIGHT=3
exports.SPOT_NAV_RIGHT=SPOT_NAV_RIGHT
var SPOT_NAV_DOWN=4
exports.SPOT_NAV_DOWN=SPOT_NAV_DOWN
var SPOT_NAV_NEXT=5
exports.SPOT_NAV_NEXT=SPOT_NAV_NEXT
var SPOT_NAV_PREV=6
exports.SPOT_NAV_PREV=SPOT_NAV_PREV
var SPOT_NAV_MAX=7
var BUTTON_ANY=-2
exports.BUTTON_ANY=BUTTON_ANY
var SPOT_DEFAULT={key:undefined,disabled:false,tooltip:null,in_event_cb:null,drag_target:false,drag_over:false,button:BUTTON_ANY,is_button:false,button_long_press:false,pad_focusable:true,spatial_focus:true,auto_focus:false,long_press_focuses:true,sound_button:"button_click",sound_rollover:"rollover",touch_focuses:false,disabled_focusable:true,hotkey:null,hotpad:null,focus_steal:false,sticky_focus:false,custom_nav:null}
exports.SPOT_DEFAULT=SPOT_DEFAULT
var SPOT_DEFAULT_BUTTON=_extends({},SPOT_DEFAULT,{is_button:true})
exports.SPOT_DEFAULT_BUTTON=SPOT_DEFAULT_BUTTON
var SPOT_DEFAULT_BUTTON_DISABLED=_extends({},SPOT_DEFAULT,{disabled:true,sound_rollover:null})
exports.SPOT_DEFAULT_BUTTON_DISABLED=SPOT_DEFAULT_BUTTON_DISABLED
var SPOT_DEFAULT_BUTTON_DRAW_ONLY=_extends({},SPOT_DEFAULT,{pad_focusable:false})
exports.SPOT_DEFAULT_BUTTON_DRAW_ONLY=SPOT_DEFAULT_BUTTON_DRAW_ONLY
var SPOT_DEFAULT_LABEL=_extends({},SPOT_DEFAULT,{sound_rollover:null,touch_focuses:true})
exports.SPOT_DEFAULT_LABEL=SPOT_DEFAULT_LABEL
var SPOT_STATE_REGULAR=1
exports.SPOT_STATE_REGULAR=SPOT_STATE_REGULAR
var SPOT_STATE_DOWN=2
exports.SPOT_STATE_DOWN=SPOT_STATE_DOWN
var SPOT_STATE_FOCUSED=3
exports.SPOT_STATE_FOCUSED=SPOT_STATE_FOCUSED
var SPOT_STATE_DISABLED=4
exports.SPOT_STATE_DISABLED=SPOT_STATE_DISABLED
var assert=require("assert")
var abs=Math.abs,max=Math.max
var _camera2dJs=require("./camera2d.js")
var camera2d=_camera2dJs
var _engineJs=require("./engine.js")
var engine=_engineJs
var _inputJs=require("./input.js")
var KEYS=_inputJs.KEYS
var PAD=_inputJs.PAD
var dragDrop=_inputJs.dragDrop
var dragOver=_inputJs.dragOver
var inputClick=_inputJs.inputClick
var inputEatenMouse=_inputJs.inputEatenMouse
var inputTouchMode=_inputJs.inputTouchMode
var keyDown=_inputJs.keyDown
var keyDownEdge=_inputJs.keyDownEdge
var longPress=_inputJs.longPress
var mouseButtonHadEdge=_inputJs.mouseButtonHadEdge
var mouseDomPos=_inputJs.mouseDomPos
var mouseDownAnywhere=_inputJs.mouseDownAnywhere
var mouseDownEdge=_inputJs.mouseDownEdge
var mouseDownMidClick=_inputJs.mouseDownMidClick
var mouseMoved=_inputJs.mouseMoved
var mouseOver=_inputJs.mouseOver
var mousePosIsTouch=_inputJs.mousePosIsTouch
var padButtonDownEdge=_inputJs.padButtonDownEdge
var _settingsJs=require("./settings.js")
var settings=_settingsJs
var _uiJs=require("./ui.js")
var ui=_uiJs
var _uiJs2=require("./ui.js")
var checkHooks=_uiJs2.checkHooks
var drawLine=_uiJs2.drawLine
var drawRect=_uiJs2.drawRect
var drawTooltipBox=_uiJs2.drawTooltipBox
var playUISound=_uiJs2.playUISound
var focus_sub_rect=null
var focus_sub_rect_elem
var sub_stack=[]
var focus_key=null
var focus_is_sticky=false
var focus_key_nonsticky=null
var focus_pos={x:0,y:0,w:0,h:0}
var frame_spots=[]
var focus_next=[]
var focus_next_via=[]
var frame_autofocus_spots={}
var last_frame_autofocus_spots={}
var did_canvas_spot=false
var pad_mode=false
function spotPadMode(){return pad_mode}function spotlog(){}function spotKey(param){if(param.key_computed){if(!engine.defines.SPOT_DEBUG){return param.key_computed}}profilerStart("spotKey")
var key=param.key||(focus_sub_rect?focus_sub_rect.key_computed:"")+"_"+param.x+"_"+param.y
if(param.key_computed){assert.equal(param.key_computed,key)}else{param.key_computed=key}profilerStop("spotKey")
return param.key_computed}function spotFocusSet(param,from_mouseover,force,log){if(from_mouseover&&(!mouseMoved()||mousePosIsTouch())){return false}var def=param.def||SPOT_DEFAULT
var sound_rollover=param.sound_rollover===undefined?def.sound_rollover:param.sound_rollover
var key=param.key_computed||spotKey(param)
var use_nonsticky=focus_is_sticky&&!force&&from_mouseover&&key!==focus_key
var key_prev=use_nonsticky?focus_key_nonsticky:focus_key
if((sound_rollover||!from_mouseover)&&key_prev!==key){playUISound(sound_rollover||SPOT_DEFAULT.sound_rollover)}if(key_prev!==key||pad_mode!==!from_mouseover){spotlog("spotFocusSet",key,log,from_mouseover?"":"pad_mode")}pad_mode=!from_mouseover
if(use_nonsticky){focus_key_nonsticky=key}else{focus_key=key
var sticky_focus=param.sticky_focus===undefined?def.sticky_focus:param.sticky_focus
focus_is_sticky=sticky_focus
focus_key_nonsticky=null}assert(param.dom_pos)
return true}function spotUnfocus(){spotlog("spotUnfocus")
focus_key=null
focus_is_sticky=false
focus_key_nonsticky=null
pad_mode=false}var TARGET_QUAD=0
var TARGET_HALF=1
var TARGET_ALL=2
function findBestTargetInternal(nav,dom_pos,targets,precision,filter){var start_w2=dom_pos.w/2
var start_h2=dom_pos.h/2
var start_x=dom_pos.x+start_w2
var start_y=dom_pos.y+start_h2
var start_left=dom_pos.x
var start_right=dom_pos.x+dom_pos.w
var start_top=dom_pos.y
var start_bottom=dom_pos.y+dom_pos.h
var best=null
var bestd
for(var ii=0;ii<targets.length;++ii){var param=targets[ii]
if(!filter(param)){continue}var target=param.dom_pos
var d=void 0
if(precision===TARGET_QUAD){var quadrant=void 0
var target_right=target.x+target.w
var target_bottom=target.y+target.h
var left_dx=start_left-target_right
var right_dx=target.x-start_right
var top_dy=start_top-target_bottom
var bottom_dy=target.y-start_bottom
if(left_dx>=-start_w2&&target_bottom>start_top-left_dx&&target.y<start_bottom+left_dx){quadrant=SPOT_NAV_LEFT
d=left_dx+max(target.y-start_y,start_y-target_bottom,0)}else if(right_dx>=-start_w2&&target_bottom>start_top-right_dx&&target.y<start_bottom+right_dx){quadrant=SPOT_NAV_RIGHT
d=right_dx+max(target.y-start_y,start_y-target_bottom,0)}else if(top_dy>=-start_h2&&target_right>=start_left-top_dy&&target.x<=start_right+top_dy){quadrant=SPOT_NAV_UP
d=top_dy+max(target.x-start_x,start_x-target_right,0)}else if(bottom_dy>=-start_h2&&target_right>=start_left-bottom_dy&&target.x<=start_right+bottom_dy){quadrant=SPOT_NAV_DOWN
d=bottom_dy+max(target.x-start_x,start_x-target_right,0)}if(quadrant===undefined){var x=target.x+target.w/2
var y=target.y+target.h/2
var dx=x-start_x
var dy=y-start_y
d=abs(dx)+abs(dy)
if(abs(dx)>abs(dy)){if(dx>0){quadrant=SPOT_NAV_RIGHT}else{quadrant=SPOT_NAV_LEFT}}else{if(dy>0){quadrant=SPOT_NAV_DOWN}else{quadrant=SPOT_NAV_UP}}}if(quadrant!==nav){continue}}else{var _x=target.x+target.w/2
var _y=target.y+target.h/2
var _dx=_x-start_x
var _dy=_y-start_y
d=abs(_dx)+abs(_dy)
if(precision===TARGET_HALF){if(_dx<=0&&nav===SPOT_NAV_RIGHT||_dx>=0&&nav===SPOT_NAV_LEFT||_dy<=0&&nav===SPOT_NAV_DOWN||_dy>=0&&nav===SPOT_NAV_UP){continue}}else{}}if(!best||d<bestd){best=param
bestd=d}}return best}var EPSILON=1e-5
var debug_style
function spotDebugList(show_all,list){for(var ii=0;ii<list.length;++ii){var area=list[ii]
var pos=area.dom_pos
var color=void 0
if(area.spot_debug_ignore){continue}if(area.only_mouseover){color=[1,.5,0,.5]}else{var def=area.def||SPOT_DEFAULT
var pad_focusable=!area.is_sub_rect&&(area.pad_focusable===undefined?def.pad_focusable:area.pad_focusable)
if(!pad_focusable){continue}var spatial_focus=area.spatial_focus===undefined?def.spatial_focus:area.spatial_focus
if(!spatial_focus){continue}for(var jj=0;jj<list.length;++jj){if(ii===jj){continue}var other=list[jj]
if(other.sub_rect!==area.sub_rect){continue}var other_def=other.def||SPOT_DEFAULT
var other_pad_focusable=!other.is_sub_rect&&(other.pad_focusable===undefined?other_def.pad_focusable:other.pad_focusable)
if(other.only_mouseover||!other_pad_focusable){continue}var other_spatial_focus=other.spatial_focus===undefined?other_def.spatial_focus:other.spatial_focus
if(!other_spatial_focus){continue}var other_pos=other.dom_pos
if(pos.x<other_pos.x+other_pos.w-EPSILON&&pos.x+pos.w>other_pos.x+EPSILON&&pos.y<other_pos.y+other_pos.h-EPSILON&&pos.y+pos.h>other_pos.y+EPSILON){color=[1,0,0,.5]}}}if(!show_all&&!color){continue}drawRect(pos.x,pos.y,pos.x+pos.w,pos.y+pos.h,Z.DEBUG,color||[1,1,0,.5])
if(!debug_style){debug_style=ui.font.style(null,{color:255,outline_color:4294967244,outline_width:2})}ui.font.drawSizedAligned(debug_style,pos.x,pos.y,Z.DEBUG,8,ui.font.ALIGN.HVCENTERFIT,pos.w,pos.h,area.key_computed||"unknown")}}function spotDebug(){camera2d.push()
camera2d.setDOMMapped()
var show_all=keyDown(KEYS.SHIFT)
spotDebugList(show_all,frame_spots)
if(pad_mode||show_all){for(var ii=SPOT_NAV_LEFT;ii<=SPOT_NAV_DOWN;++ii){var next=focus_next[ii]
if(next){var pos=focus_pos
next=next.dom_pos
var via=focus_next_via[ii]
if(via){pos=via.dom_pos
drawLine(pos.x+pos.w/2,pos.y+pos.h/2,next.x+next.w/2,next.y+next.h/2,Z.DEBUG,1,.95,[1,.5,0,1])
pos=focus_pos
next=via.dom_pos}drawLine(pos.x+pos.w/2,pos.y+pos.h/2,next.x+next.w/2,next.y+next.h/2,Z.DEBUG,1,.95,[1,1,0,1])}}}camera2d.pop()}var filter_sub_rect
var filter_not
function filterMatchesSubrect(param){return param!==filter_not&&param.sub_rect===filter_sub_rect}function overlaps(r1,r2){return r1.x+r1.w>r2.x&&r1.x<r2.x+r2.w&&r1.y+r1.h>r2.y&&r1.y<r2.y+r2.h}function contains(outer,inner){return inner.x>=outer.x&&inner.x+inner.w<=outer.x+outer.w&&inner.y>=outer.y&&inner.y+inner.h<=outer.y+outer.h}function filterInSubrectView(param){if(param.sub_rect!==filter_sub_rect){return false}return overlaps(param.dom_pos,filter_sub_rect.dom_pos)}function filterMatchesSubrectOrInVisibleChild(param){if(param===filter_not){return false}if(param.sub_rect===filter_sub_rect){return true}if(param.sub_rect&&param.sub_rect.sub_rect===filter_sub_rect){return overlaps(param.dom_pos,param.sub_rect.dom_pos)}return false}var SUBRECT_FILTERS=[filterInSubrectView,filterMatchesSubrect]
function findBestWithinSubrect(nav,dom_pos,pad_focusable_list,best,precision_max){filter_sub_rect=best
for(var jj=0;jj<SUBRECT_FILTERS.length;++jj){var filter=SUBRECT_FILTERS[jj]
for(var precision=0;precision<=precision_max;++precision){var best_inside=findBestTargetInternal(nav,dom_pos,pad_focusable_list,precision,filter)
if(best_inside){return best_inside}}}return null}function findBestTargetFromSubRect(start_sub_rect,nav,dom_pos,pad_focusable_list,precision){filter_sub_rect=start_sub_rect
var best=findBestTargetInternal(nav,dom_pos,pad_focusable_list,precision,filterMatchesSubrectOrInVisibleChild)
if(best){if(best.is_sub_rect){focus_next_via[nav]=best
best=findBestWithinSubrect(nav,dom_pos,pad_focusable_list,best,precision)
if(!best){focus_next_via[nav]=undefined}}}return best}function spotCalcNavTargets(){for(var ii=1;ii<SPOT_NAV_MAX;++ii){focus_next[ii]=undefined
focus_next_via[ii]=undefined}var start
var pad_focusable_list=[]
var prev
var first_non_sub_rect
for(var _ii=0;_ii<frame_spots.length;++_ii){var param=frame_spots[_ii]
if(param.is_sub_rect){if(!param.is_empty_sub_rect){pad_focusable_list.push(param)}}else if(param.key_computed===focus_key){if(!focus_next[SPOT_NAV_PREV]&&prev){focus_next[SPOT_NAV_PREV]=prev}start=param}else{var def=param.def||SPOT_DEFAULT
var pad_focusable=param.pad_focusable===undefined?def.pad_focusable:param.pad_focusable
if(pad_focusable){if(!first_non_sub_rect){first_non_sub_rect=param}prev=param
if(!focus_next[SPOT_NAV_NEXT]&&start){focus_next[SPOT_NAV_NEXT]=param}var spatial_focus=param.spatial_focus===undefined?def.spatial_focus:param.spatial_focus
if(spatial_focus){pad_focusable_list.push(param)}}}}if(!focus_next[SPOT_NAV_PREV]&&prev){focus_next[SPOT_NAV_PREV]=prev}if(!focus_next[SPOT_NAV_NEXT]){focus_next[SPOT_NAV_NEXT]=first_non_sub_rect}var precision_max
var start_sub_rect
if(start){start_sub_rect=start.sub_rect
focus_pos.x=start.dom_pos.x
focus_pos.y=start.dom_pos.y
focus_pos.w=start.dom_pos.w
focus_pos.h=start.dom_pos.h
precision_max=TARGET_HALF}else{start_sub_rect=null
for(var _ii2=0;_ii2<frame_spots.length;++_ii2){var _param=frame_spots[_ii2]
if(_param.is_sub_rect){if(contains(_param.dom_pos,focus_pos)){start_sub_rect=_param}}}if(start_sub_rect){precision_max=TARGET_HALF}else{precision_max=TARGET_ALL}}for(var nav=SPOT_NAV_LEFT;nav<=SPOT_NAV_DOWN;++nav){for(var precision=0;precision<=precision_max;++precision){filter_not=null
var best=findBestTargetFromSubRect(start_sub_rect,nav,focus_pos,pad_focusable_list,precision)
if(best){focus_next[nav]=best
break}if(start_sub_rect){filter_not=start_sub_rect
best=findBestTargetFromSubRect(start_sub_rect.sub_rect,nav,focus_pos,pad_focusable_list,precision)
if(best){focus_next[nav]=best
break}}}}if(start){var _def=start.def||SPOT_DEFAULT
var custom_nav=start.custom_nav===undefined?_def.custom_nav:start.custom_nav
if(custom_nav){var by_key
for(var key in custom_nav){var target=custom_nav[key]
if(!target){focus_next[key]=target}else{if(!by_key){by_key={}
for(var _ii3=0;_ii3<frame_spots.length;++_ii3){var _param2=frame_spots[_ii3]
by_key[_param2.key_computed]=_param2}}if(by_key[target]){focus_next[key]=by_key[target]}}}}}}function spotTopOfFrame(){if(mouseMoved()){var pos=mouseDomPos()
focus_pos.x=pos[0]
focus_pos.y=pos[1]
focus_pos.w=0
focus_pos.h=0}if(mouseDownEdge({peek:true})){pad_mode=false}sub_stack.length=0}function spotEndOfFrame(){if(did_canvas_spot&&focus_key&&(keyDownEdge(KEYS.ESC)||padButtonDownEdge(PAD.B))){spotUnfocus()}spotCalcNavTargets()
last_frame_autofocus_spots=frame_autofocus_spots
did_canvas_spot=false
frame_spots=[]
frame_autofocus_spots={}}function frameSpotsPush(param){assert(param.dom_pos)
param.sub_rect=focus_sub_rect
frame_spots.push(param)
if(focus_sub_rect){focus_sub_rect.is_empty_sub_rect=false}}function spotEntirelyObscured(param){var pos=param.dom_pos
for(var ii=0;ii<frame_spots.length;++ii){var other=frame_spots[ii]
if(other.is_sub_rect||other.sub_rect!==focus_sub_rect){continue}var other_pos=other.dom_pos
if(other_pos.x<=pos.x&&other_pos.x+other_pos.w>=pos.x+pos.w&&other_pos.y<=pos.y&&other_pos.y+other_pos.h>=pos.y+pos.h){return true}}return false}function spotSubPush(){sub_stack.push([focus_sub_rect,focus_sub_rect_elem])
focus_sub_rect=null}function spotSubPop(){var _sub_stack$pop=sub_stack.pop()
focus_sub_rect=_sub_stack$pop[0]
focus_sub_rect_elem=_sub_stack$pop[1]}function spotSubBegin(param){assert(param.key)
assert(!focus_sub_rect)
spotKey(param)
param.is_sub_rect=true
if(!param.dom_pos){param.dom_pos={}}camera2d.virtualToDomPosParam(param.dom_pos,param)
if(!spotEntirelyObscured(param)){frameSpotsPush(param)}focus_sub_rect=param
focus_sub_rect.is_empty_sub_rect=true
focus_sub_rect_elem=null}function spotSubEnd(){assert(focus_sub_rect)
focus_sub_rect=null
return focus_sub_rect_elem}function spotMouseoverHook(pos_param,param){if(inputEatenMouse()||param.peek){return}if(param.key_computed){return}if(!pos_param.dom_pos){pos_param.dom_pos={}}camera2d.virtualToDomPosParam(pos_param.dom_pos,pos_param)
if(!spotEntirelyObscured(pos_param)){pos_param.only_mouseover=true
pos_param.pad_focusable=false
if(engine.defines.SPOT_DEBUG){pos_param.spot_debug_ignore=param.eat_clicks||param.spot_debug_ignore}frameSpotsPush(pos_param)}}function keyCheck(nav_dir){switch(nav_dir){case SPOT_NAV_LEFT:return keyDownEdge(KEYS.LEFT)||padButtonDownEdge(PAD.LEFT)
case SPOT_NAV_UP:return keyDownEdge(KEYS.UP)||padButtonDownEdge(PAD.UP)
case SPOT_NAV_RIGHT:return keyDownEdge(KEYS.RIGHT)||padButtonDownEdge(PAD.RIGHT)
case SPOT_NAV_DOWN:return keyDownEdge(KEYS.DOWN)||padButtonDownEdge(PAD.DOWN)
case SPOT_NAV_PREV:return keyDown(KEYS.SHIFT)&&keyDownEdge(KEYS.TAB)||padButtonDownEdge(PAD.LEFT_BUMPER)
case SPOT_NAV_NEXT:return!keyDown(KEYS.SHIFT)&&keyDownEdge(KEYS.TAB)||padButtonDownEdge(PAD.RIGHT_BUMPER)
default:assert(false)}return false}function spotFocusCheckNavButtonsFocused(param){for(var ii=1;ii<SPOT_NAV_MAX;++ii){if(focus_next[ii]!==undefined&&keyCheck(ii)){if(focus_next[ii]){spotFocusSet(focus_next[ii],false,false,"nav_focused")}else{param.out.nav=ii}}}}function spotFocusCheckNavButtonsUnfocused(param){for(var ii=1;ii<SPOT_NAV_MAX;++ii){if(focus_next[ii]&&focus_next[ii].key_computed===param.key_computed&&keyCheck(ii)){spotFocusSet(focus_next[ii],false,false,"nav_unfocused")}}}function spotFocusSetSilent(param){var key=spotKey(param)
var def=param.def||SPOT_DEFAULT
focus_key=key
var sticky_focus=param.sticky_focus===undefined?def.sticky_focus:param.sticky_focus
focus_is_sticky=sticky_focus
focus_key_nonsticky=null}function spotFocusSteal(param){var key=spotKey(param)
spotlog("spotFocusSteal",key,false)
pad_mode=true
spotFocusSetSilent(param)}function spotFocusCheck(param){var out=param.out
if(!out){out=param.out={}}out.focused=false
out.kb_focused=false
out.allow_focus=false
var key=spotKey(param)
var def=param.def||SPOT_DEFAULT
var disabled=param.disabled===undefined?def.disabled:param.disabled
if(disabled){var disabled_focusable=param.disabled_focusable===undefined?def.disabled_focusable:param.disabled_focusable
if(!disabled_focusable){return out}}var focus_steal=param.focus_steal===undefined?def.focus_steal:param.focus_steal
if(focus_steal){spotFocusSetSilent(param)}if(focus_key===key){spotFocusCheckNavButtonsFocused(param)}else{spotFocusCheckNavButtonsUnfocused(param)}var focused=focus_key===key||focus_key_nonsticky===key
if(inputEatenMouse()){if(focus_key===key){spotUnfocus()
focused=false}if(focus_key_nonsticky===key){focus_key_nonsticky=null
focused=false}}else{out.allow_focus=true
if(!param.dom_pos){param.dom_pos={}}camera2d.virtualToDomPosParam(param.dom_pos,param)
if(!spotEntirelyObscured(param)){frameSpotsPush(param)
var auto_focus=param.auto_focus===undefined?def.auto_focus:param.auto_focus
if(auto_focus){if(!focused&&!last_frame_autofocus_spots[key]&&pad_mode){spotlog("auto_focus",key)
spotFocusSetSilent(param)
focused=true}frame_autofocus_spots[key]=param}}if(focus_sub_rect&&focus_key===key){focus_sub_rect_elem=param}}out.kb_focused=focus_key===key
out.focused=focused
return out}function spotEndInput(){if(engine.defines.SPOT_DEBUG){spotDebug()}}var last_signal={key:"",timestamp:0}
function spotSignalRet(param){var out=param.out
var key=param.key_computed
assert(key)
out.double_click=key===last_signal.key&&engine.frame_timestamp-last_signal.timestamp<settings.double_click_time
last_signal.key=key
last_signal.timestamp=engine.frame_timestamp
out.ret++}function spot(param){profilerStart("spot")
var def=param.def||SPOT_DEFAULT
var disabled=param.disabled===undefined?def.disabled:param.disabled
var tooltip=param.tooltip===undefined?def.tooltip:param.tooltip
var is_button=param.is_button===undefined?def.is_button:param.is_button
var button_long_press=param.button_long_press===undefined?def.button_long_press:param.button_long_press
var in_event_cb=param.in_event_cb===undefined?def.in_event_cb:param.in_event_cb
var drag_target=param.drag_target===undefined?def.drag_target:param.drag_target
var drag_over=param.drag_over===undefined?def.drag_over:param.drag_over
var touch_focuses=param.touch_focuses===undefined?def.touch_focuses:param.touch_focuses
var focus_steal=param.focus_steal===undefined?def.focus_steal:param.focus_steal
var custom_nav=param.custom_nav===undefined?def.custom_nav:param.custom_nav
var out=param.out
if(!out){out=param.out={}}out.focused=false
out.ret=0
if(button_long_press){out.long_press=false}if(drag_target){out.drag_drop=null}if(custom_nav){out.nav=SPOT_NAV_NONE}var state=SPOT_STATE_REGULAR
var _spotFocusCheck=spotFocusCheck(param),focused=_spotFocusCheck.focused,allow_focus=_spotFocusCheck.allow_focus,kb_focused=_spotFocusCheck.kb_focused
if(disabled){state=SPOT_STATE_DISABLED}else{var button_click
if(drag_target&&(out.drag_drop=dragDrop(param))){spotFocusSet(param,true,true,"drag_drop")
spotSignalRet(param)
focused=true}else if(button_long_press&&(button_click=longPress(param))||is_button&&(button_click=inputClick(param))){out.long_press=button_click.long_press
out.button=button_click.button
out.pos=button_click.pos
if(mousePosIsTouch()){if(touch_focuses){if(!focused){spotFocusSet(param,false,false,"touch_focus")
focused=true}else{spotSignalRet(param)
spotUnfocus()
focused=false}}else{spotSignalRet(param)
spotUnfocus()
focused=false}}else{spotSignalRet(param)
spotFocusSet(param,true,true,"click")
focused=true}}else if(!is_button&&touch_focuses&&mousePosIsTouch()&&inputClick(param)){spotFocusSet(param,false,false,"touch_focus")
focused=true}else if(drag_target&&dragOver(param)){spotFocusSet(param,true,false,"drag_over")
focused=true
if(mouseDownAnywhere()){state=SPOT_STATE_DOWN}}else if(drag_over&&dragOver(param)){}}if(allow_focus&&inputTouchMode()){var long_press_focuses=param.long_press_focuses===undefined?def.long_press_focuses:param.long_press_focuses
if(long_press_focuses&&longPress(param)){spotFocusSet(param,false,false,"long_press")
focused=true}}var is_mouseover=mouseOver(param)
if(focused&&!focus_steal&&!is_mouseover){if(mouseButtonHadEdge()){focused=false
spotUnfocus()}else if(mouseMoved()){focused=false
if(focus_key===param.key_computed){spotUnfocus()}else if(focus_key_nonsticky===param.key_computed){focus_key_nonsticky=null}}}if(is_mouseover){if(allow_focus){if(spotFocusSet(param,true,false,"mouseover")){focused=true}}}if(is_button&&mouseDownMidClick(param)){if(!disabled){state=SPOT_STATE_DOWN}}var button_activate=false
if(focused){if(state===SPOT_STATE_REGULAR){state=SPOT_STATE_FOCUSED}if(is_button&&!disabled&&kb_focused){var key_opts=in_event_cb?{in_event_cb:in_event_cb}:null
if(keyDownEdge(KEYS.SPACE,key_opts)||keyDownEdge(KEYS.RETURN,key_opts)||padButtonDownEdge(PAD.A)){button_activate=true}}}if(!disabled){var hotkey=param.hotkey===undefined?def.hotkey:param.hotkey
var hotpad=param.hotpad===undefined?def.hotpad:param.hotpad
if(hotkey){var _key_opts=in_event_cb?{in_event_cb:in_event_cb}:null
if(keyDownEdge(hotkey,_key_opts)){button_activate=true}}if(hotpad){if(padButtonDownEdge(hotpad)){button_activate=true}}}if(button_activate){spotSignalRet(param)
out.button=0
out.pos=null}out.focused=focused
if(out.ret){state=SPOT_STATE_DOWN
var sound_button=param.sound_button===undefined?def.sound_button:param.sound_button
playUISound(sound_button)}if(out.focused&&tooltip){drawTooltipBox(param)}checkHooks(param,out.ret)
out.spot_state=state
profilerStop("spot")
return out}var canvas_spot={def:SPOT_DEFAULT,key:"canvas",pad_focusable:true,spatial_focus:false,x:Infinity,y:Infinity,w:0,h:0,sound_rollover:null}
function spotFocusableCanvas(){if(!did_canvas_spot){did_canvas_spot=true
canvas_spot.focus_steal=!focus_key
spot(canvas_spot)}return canvas_spot.out}var CANVAS_HANDLES_DEFAULT=[SPOT_NAV_LEFT,SPOT_NAV_UP,SPOT_NAV_RIGHT,SPOT_NAV_DOWN]
function spotCanvasHandles(list){var custom_nav={}
for(var ii=0;ii<list.length;++ii){custom_nav[list[ii]]=undefined}canvas_spot.custom_nav=custom_nav}spotCanvasHandles(CANVAS_HANDLES_DEFAULT)

},{"./camera2d.js":13,"./engine.js":20,"./input.js":36,"./settings.js":55,"./ui.js":69,"assert":undefined}],64:[function(require,module,exports){
"use strict"
exports.create=create
var floor=Math.floor,random=Math.random
function GlovSpriteAnimation(params){this.frame=0
this.time=0
this.frame_time=0
this.state=null
this.anim=null
this.anim_idx=0
if(params instanceof GlovSpriteAnimation){this.data=params.data
this.setState(params.state)}else{this.data=params
for(var key in this.data){var anim=this.data[key]
if(typeof anim.frames==="number"){anim.frames=[anim.frames]}if(typeof anim.times==="number"){var arr=new Array(anim.frames.length)
for(var ii=0;ii<anim.frames.length;++ii){arr[ii]=anim.times}anim.times=arr}if(anim.times_random){if(typeof anim.times_random==="number"){var _arr=new Array(anim.frames.length)
for(var _ii=0;_ii<anim.frames.length;++_ii){_arr[_ii]=anim.times_random}anim.times_random=_arr}}anim.total_time=0
for(var _ii2=0;_ii2<anim.times.length;++_ii2){anim.total_time+=anim.times[_ii2]}if(anim.loop===undefined){anim.loop=true}}}}function create(params){return new GlovSpriteAnimation(params)}exports.createSpriteAnimation=create
GlovSpriteAnimation.prototype.clone=function(){return new GlovSpriteAnimation(this)}
GlovSpriteAnimation.prototype.setFrameIndex=function(anim_idx){this.anim_idx=anim_idx
this.frame=this.anim.frames[anim_idx]
this.frame_time=this.anim.times[anim_idx]
if(this.anim.times_random){this.frame_time+=floor(random()*this.anim.times_random[anim_idx])}}
GlovSpriteAnimation.prototype.setState=function(state,force){if(state===this.state&&!force){return this}if(!this.data[state]){console.error("Tried to set anim state "+state+" which does not exist")
return this}this.state=state
this.anim=this.data[state]
if(this.anim.init_time){this.time=floor(random()*this.anim.init_time)}else{this.time=0}this.setFrameIndex(0)
return this}
GlovSpriteAnimation.prototype.progress=function(){if(!this.anim){return 1}var time=this.time
for(var ii=0;ii<this.anim_idx;++ii){time+=this.anim.times[ii]}return time/this.anim.total_time}
GlovSpriteAnimation.prototype.update=function(dt){if(!this.anim){return}this.time+=dt
if(this.time>this.frame_time){this.time-=this.frame_time
this.anim_idx++
if(this.anim_idx===this.anim.frames.length){if(this.anim.loop){this.anim_idx%=this.anim.frames.length}else if(this.anim.transition_to){this.setState(this.anim.transition_to)}else{this.anim=null
return}}this.setFrameIndex(this.anim_idx)
if(this.time>=this.frame_time){this.time=this.frame_time-1}}}
GlovSpriteAnimation.prototype.getFrame=function(dt){if(dt!==undefined){this.update(dt)}return this.frame}

},{}],65:[function(require,module,exports){
"use strict"
exports.BlendMode=exports.BLEND_PREMULALPHA=exports.BLEND_ALPHA=exports.BLEND_ADDITIVE=void 0
exports.blendModeReset=blendModeReset
exports.blendModeSet=blendModeSet
exports.buildRects=buildRects
exports.clip=clip
exports.clipPause=clipPause
exports.clipPop=clipPop
exports.clipPush=clipPush
exports.clipResume=clipResume
exports.clipped=clipped
exports.create=create
exports.draw=draw
exports.drawPartial=drawPartial
exports.queueSpriteData=queueSpriteData
exports.queuefn=queuefn
exports.queueraw=queueraw
exports.queueraw4=queueraw4
exports.queueraw4color=queueraw4color
exports.queueraw4colorBuffer=queueraw4colorBuffer
exports.queuesprite=queuesprite
exports.spriteChainedStart=spriteChainedStart
exports.spriteChainedStop=spriteChainedStop
exports.spriteDataAlloc=spriteDataAlloc
exports.spriteQueuePop=spriteQueuePop
exports.spriteQueuePush=spriteQueuePush
exports.sprite_vshader=exports.sprite_fshader=void 0
exports.startup=startup
exports.createSprite=create
exports.spritesClip=clip
var BlendMode={BLEND_ALPHA:0,BLEND_ADDITIVE:1,BLEND_PREMULALPHA:2}
exports.BlendMode=BlendMode
var BLEND_ALPHA=0
exports.BLEND_ALPHA=BLEND_ALPHA
var BLEND_ADDITIVE=1
exports.BLEND_ADDITIVE=BLEND_ADDITIVE
var BLEND_PREMULALPHA=2
exports.BLEND_PREMULALPHA=BLEND_PREMULALPHA
var assert=require("assert")
var camera2d=require("./camera2d.js")
var engine=require("./engine.js")
var geom=require("./geom.js")
var cos=Math.cos,max=Math.max,min=Math.min,round=Math.round,sin=Math.sin
var textures=require("./textures.js")
var cmpTextureArray=textures.cmpTextureArray
var shaders=require("./shaders.js")
var _require=require("../common/util.js"),nextHighestPowerOfTwo=_require.nextHighestPowerOfTwo
var _require2=require("../common/vmath.js"),vec2=_require2.vec2,vec4=_require2.vec4
var sprite_vshader
exports.sprite_vshader=sprite_vshader
var sprite_fshader
exports.sprite_fshader=sprite_fshader
var sprite_dual_fshader
var clip_space=vec4()
var sprite_shader_params={clip_space:clip_space}
var last_uid=0
var geom_stats
var sprite_queue=[]
var sprite_freelist=[]
var sprite_queue_stack=[]
function spriteQueuePush(new_list){assert(sprite_queue_stack.length<10)
sprite_queue_stack.push(sprite_queue)
sprite_queue=new_list||[]}function spriteQueuePop(for_pause){assert(sprite_queue_stack.length)
assert(for_pause||!sprite_queue.length)
sprite_queue=sprite_queue_stack.pop()}function SpriteData(){this.data=new Float32Array(32)
this.texs=null
this.shader=null
this.shader_params=null
this.x=0
this.y=0
this.z=0
this.blend=0
this.uid=0
this.chained=false
this.next=null}SpriteData.prototype.queue=function(z){++geom_stats.sprites
if(!this.chained){this.z=z
this.uid=++last_uid
sprite_queue.push(this)}}
var is_chained=false
var chained_prev=null
function spriteChainedStart(){is_chained=true
chained_prev=null}function spriteChainedStop(){is_chained=false
chained_prev=null}function spriteDataAlloc(texs,shader,shader_params,blend){var ret
if(sprite_freelist.length){ret=sprite_freelist.pop()}else{ret=new SpriteData}ret.texs=texs
if(is_chained&&chained_prev){ret.chained=true
chained_prev.next=ret}else{ret.chained=false
ret.shader=shader||null
if(shader_params){shader_params.clip_space=sprite_shader_params.clip_space
ret.shader_params=shader_params}else{ret.shader_params=null}ret.blend=blend||0}if(is_chained){chained_prev=ret}return ret}function cmpSprite(a,b){++geom_stats.sprite_sort_cmps
if(a.z!==b.z){return a.z-b.z}if(a.blend===BLEND_ADDITIVE&&b.blend===BLEND_ADDITIVE){return 0}if(a.y!==b.y){return a.y-b.y}if(a.x!==b.x){return a.x-b.x}return a.uid-b.uid}function queuefn(z,fn){assert(isFinite(z))
sprite_queue.push({fn:fn,x:0,y:0,z:z,uid:++last_uid})}function queueraw4color(texs,x0,y0,c0,u0,v0,x1,y1,c1,u1,v1,x2,y2,c2,u2,v2,x3,y3,c3,u3,v3,z,shader,shader_params,blend){assert(isFinite(z))
var elem=spriteDataAlloc(texs,shader,shader_params,blend)
var data=elem.data
data[0]=(x0-camera2d.data[0])*camera2d.data[4]
data[1]=(y0-camera2d.data[1])*camera2d.data[5]
data[2]=c0[0]
data[3]=c0[1]
data[4]=c0[2]
data[5]=c0[3]
data[6]=u0
data[7]=v0
data[8]=(x1-camera2d.data[0])*camera2d.data[4]
data[9]=(y1-camera2d.data[1])*camera2d.data[5]
data[10]=c1[0]
data[11]=c1[1]
data[12]=c1[2]
data[13]=c1[3]
data[14]=u1
data[15]=v1
data[16]=(x2-camera2d.data[0])*camera2d.data[4]
data[17]=(y2-camera2d.data[1])*camera2d.data[5]
data[18]=c2[0]
data[19]=c2[1]
data[20]=c2[2]
data[21]=c2[3]
data[22]=u2
data[23]=v2
data[24]=(x3-camera2d.data[0])*camera2d.data[4]
data[25]=(y3-camera2d.data[1])*camera2d.data[5]
data[26]=c3[0]
data[27]=c3[1]
data[28]=c3[2]
data[29]=c3[3]
data[30]=u3
data[31]=v3
elem.x=data[0]
elem.y=data[1]
elem.queue(z)
return elem}function queueraw4(texs,x0,y0,x1,y1,x2,y2,x3,y3,z,u0,v0,u1,v1,color,shader,shader_params,blend){return queueraw4color(texs,x0,y0,color,u0,v0,x1,y1,color,u0,v1,x2,y2,color,u1,v1,x3,y3,color,u1,v0,z,shader,shader_params,blend)}function queueSpriteData(elem,z){assert(isFinite(z))
var data=elem.data
data[0]=(data[0]-camera2d.data[0])*camera2d.data[4]
data[1]=(data[1]-camera2d.data[1])*camera2d.data[5]
data[8]=(data[8]-camera2d.data[0])*camera2d.data[4]
data[9]=(data[9]-camera2d.data[1])*camera2d.data[5]
data[16]=(data[16]-camera2d.data[0])*camera2d.data[4]
data[17]=(data[17]-camera2d.data[1])*camera2d.data[5]
data[24]=(data[24]-camera2d.data[0])*camera2d.data[4]
data[25]=(data[25]-camera2d.data[1])*camera2d.data[5]
elem.x=data[0]
elem.y=data[1]
elem.queue(z)
return elem}function queueraw4colorBuffer(texs,buf,z,shader,shader_params,blend){assert(isFinite(z))
var elem=spriteDataAlloc(texs,shader,shader_params,blend)
var data=elem.data
for(var ii=0;ii<32;++ii){data[ii]=buf[ii]}queueSpriteData(elem,z)
return elem}function queueraw(texs,x,y,z,w,h,u0,v0,u1,v1,color,shader,shader_params,blend){return queueraw4color(texs,x,y,color,u0,v0,x,y+h,color,u0,v1,x+w,y+h,color,u1,v1,x+w,y,color,u1,v0,z,shader,shader_params,blend)}var temp_uvs=vec4()
function fillUVs(tex,w,h,nozoom,uvs){var ubias=0
var vbias=0
if(!nozoom&&!tex.nozoom){var zoom_level=max((uvs[2]-uvs[0])*tex.width/w,(uvs[3]-uvs[1])*tex.height/h)
if(zoom_level<1){if(tex.filter_mag===gl.LINEAR){ubias=vbias=.5}else if(tex.filter_mag===gl.NEAREST){if(engine.antialias){ubias=vbias=zoom_level/2}else{ubias=vbias=zoom_level*.01}}}else if(zoom_level>1){var mipped_texels=zoom_level/2
ubias=vbias=.5+mipped_texels}if(uvs[0]>uvs[2]){ubias*=-1}if(uvs[1]>uvs[3]){vbias*=-1}}temp_uvs[0]=uvs[0]+ubias/tex.width
temp_uvs[1]=uvs[1]+vbias/tex.height
temp_uvs[2]=uvs[2]-ubias/tex.width
temp_uvs[3]=uvs[3]-vbias/tex.height}var qsp={}
function queuesprite4colorObj(){var rot=qsp.rot,z=qsp.z,sprite=qsp.sprite,color_ul=qsp.color_ul,color_ll=qsp.color_ll,color_lr=qsp.color_lr,color_ur=qsp.color_ur
assert(isFinite(z))
var elem=spriteDataAlloc(sprite.texs,qsp.shader,qsp.shader_params,qsp.blend)
var x=(qsp.x-camera2d.data[0])*camera2d.data[4]
var y=(qsp.y-camera2d.data[1])*camera2d.data[5]
var w=qsp.w*camera2d.data[4]
var h=qsp.h*camera2d.data[5]
if(qsp.pixel_perfect){x|=0
y|=0
w|=0
h|=0}elem.x=x
elem.y=y
var data=elem.data
if(!rot){var x1=x-sprite.origin[0]*w
var y1=y-sprite.origin[1]*h
var x2=x1+w
var y2=y1+h
data[0]=x1
data[1]=y1
data[8]=x1
data[9]=y2
data[16]=x2
data[17]=y2
data[24]=x2
data[25]=y1}else{var dx=sprite.origin[0]*w
var dy=sprite.origin[1]*h
var cosr=cos(rot)
var sinr=sin(rot)
var _x=x-cosr*dx+sinr*dy
var _y=y-sinr*dx-cosr*dy
var ch=cosr*h
var cw=cosr*w
var sh=sinr*h
var sw=sinr*w
data[0]=_x
data[1]=_y
data[8]=_x-sh
data[9]=_y+ch
data[16]=_x+cw-sh
data[17]=_y+sw+ch
data[24]=_x+cw
data[25]=_y+sw}fillUVs(elem.texs[0],w,h,qsp.nozoom,qsp.uvs)
data[2]=color_ul[0]
data[3]=color_ul[1]
data[4]=color_ul[2]
data[5]=color_ul[3]
data[6]=temp_uvs[0]
data[7]=temp_uvs[1]
data[10]=color_ll[0]
data[11]=color_ll[1]
data[12]=color_ll[2]
data[13]=color_ll[3]
data[14]=temp_uvs[0]
data[15]=temp_uvs[3]
data[18]=color_lr[0]
data[19]=color_lr[1]
data[20]=color_lr[2]
data[21]=color_lr[3]
data[22]=temp_uvs[2]
data[23]=temp_uvs[3]
data[26]=color_ur[0]
data[27]=color_ur[1]
data[28]=color_ur[2]
data[29]=color_ur[3]
data[30]=temp_uvs[2]
data[31]=temp_uvs[1]
elem.queue(z)
return elem}function queuesprite(sprite,x,y,z,w,h,rot,uvs,color,shader,shader_params,nozoom,pixel_perfect,blend){color=color||sprite.color
qsp.sprite=sprite
qsp.x=x
qsp.y=y
qsp.z=z
qsp.w=w
qsp.h=h
qsp.rot=rot
qsp.uvs=uvs
qsp.color_ul=color
qsp.color_ll=color
qsp.color_lr=color
qsp.color_ur=color
qsp.shader=shader
qsp.shader_params=shader_params
qsp.nozoom=nozoom
qsp.pixel_perfect=pixel_perfect
qsp.blend=blend
return queuesprite4colorObj(qsp)}var clip_temp_xy=vec2()
var clip_temp_wh=vec2()
function clipCoordsScissor(x,y,w,h){camera2d.virtualToCanvas(clip_temp_xy,[x,y])
clip_temp_xy[0]=round(clip_temp_xy[0])
clip_temp_xy[1]=round(clip_temp_xy[1])
camera2d.virtualToCanvas(clip_temp_wh,[x+w,y+h])
clip_temp_wh[0]=round(clip_temp_wh[0])-clip_temp_xy[0]
clip_temp_wh[1]=round(clip_temp_wh[1])-clip_temp_xy[1]
var gd_h=engine.render_height||engine.height
return[clip_temp_xy[0],gd_h-(clip_temp_xy[1]+clip_temp_wh[1]),clip_temp_wh[0],clip_temp_wh[1]]}function clipCoordsDom(x,y,w,h){var xywh=vec4()
camera2d.virtualToDom(xywh,[x+w,y+h])
xywh[2]=xywh[0]
xywh[3]=xywh[1]
camera2d.virtualToDom(xywh,[x,y])
xywh[0]=round(xywh[0])
xywh[1]=round(xywh[1])
xywh[2]=round(xywh[2])-xywh[0]
xywh[3]=round(xywh[3])-xywh[1]
return xywh}function clip(z_start,z_end,x,y,w,h){var scissor=clipCoordsScissor(x,y,w,h)
queuefn(z_start-.01,function(){gl.enable(gl.SCISSOR_TEST)
gl.scissor(scissor[0],scissor[1],scissor[2],scissor[3])})
queuefn(z_end-.01,function(){gl.disable(gl.SCISSOR_TEST)})}var clip_stack=[]
function clipped(){return clip_stack.length>0}function clipPush(z,x,y,w,h){assert(clip_stack.length<10)
var scissor=clipCoordsScissor(x,y,w,h)
var dom_clip=clipCoordsDom(x,y,w,h)
camera2d.setInputClipping(dom_clip)
spriteQueuePush()
clip_stack.push({z:z,scissor:scissor,dom_clip:dom_clip})}function clipPop(){assert(clipped())
queuefn(Z.TOOLTIP-.1,function(){gl.disable(gl.SCISSOR_TEST)})
var _clip_stack$pop=clip_stack.pop(),z=_clip_stack$pop.z,scissor=_clip_stack$pop.scissor
var sprites=sprite_queue
spriteQueuePop(true)
if(clip_stack.length){var dom_clip=clip_stack[clip_stack.length-1].dom_clip
camera2d.setInputClipping(dom_clip)}else{camera2d.setInputClipping(null)}queuefn(z,function(){gl.enable(gl.SCISSOR_TEST)
gl.scissor(scissor[0],scissor[1],scissor[2],scissor[3])
spriteQueuePush()
sprite_queue=sprites
exports.draw()
spriteQueuePop()})}var clip_paused
function clipPause(){assert(clipped())
assert(!clip_paused)
clip_paused=true
spriteQueuePush(sprite_queue_stack[0])
camera2d.setInputClipping(null)
clip_stack.push({dom_clip:null})}function clipResume(){assert(clipped())
assert(clip_paused)
clip_stack.pop()
clip_paused=false
assert(clipped())
var dom_clip=clip_stack[clip_stack.length-1].dom_clip
spriteQueuePop(true)
camera2d.setInputClipping(dom_clip)}var batch_state
var sprite_geom
var sprite_buffer
var sprite_buffer_len=0
var sprite_buffer_batch_start=0
var sprite_buffer_idx=0
var last_blend_mode
var last_bound_shader
var MAX_VERT_COUNT=65532
var batches=[]
function commit(){if(sprite_buffer_idx===sprite_buffer_batch_start){return}batches.push({state:batch_state,start:sprite_buffer_batch_start,end:sprite_buffer_idx})
sprite_buffer_batch_start=sprite_buffer_idx}function blendModeSet(blend){if(last_blend_mode!==blend){last_blend_mode=blend
if(last_blend_mode===BLEND_ADDITIVE){gl.blendFunc(gl.SRC_ALPHA,gl.ONE)}else if(last_blend_mode===BLEND_PREMULALPHA){gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA)}else{gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA)}}}function blendModeReset(force){if(last_blend_mode!==BLEND_ALPHA||force){gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA)
last_blend_mode=BLEND_ALPHA}}function commitAndFlush(){commit()
if(!batches.length){return}assert(sprite_buffer_idx)
sprite_geom.update(sprite_buffer,sprite_buffer_idx)
sprite_geom.bind()
for(var ii=0;ii<batches.length;++ii){var batch=batches[ii]
var state=batch.state,start=batch.start,end=batch.end
if(last_bound_shader!==state.shader||state.shader_params){shaders.bind(sprite_vshader,state.shader||sprite_fshader,state.shader_params||sprite_shader_params)
last_bound_shader=state.shader}if(last_blend_mode!==state.blend){blendModeSet(state.blend)}textures.bindArray(state.texs);++geom_stats.draw_calls_sprite
gl.drawElements(sprite_geom.mode,(end-start)*3/2,gl.UNSIGNED_SHORT,start*3)}batches.length=0
sprite_buffer_idx=0
sprite_buffer_batch_start=0}function drawSetup(){if(engine.defines.NOSPRITES){sprite_queue.length=0}if(!sprite_queue.length){return}clip_space[0]=2/engine.viewport[2]
clip_space[1]=-2/engine.viewport[3]
last_blend_mode=-1
last_bound_shader=-1
if(!sprite_geom){sprite_geom=geom.create([[shaders.semantic.POSITION,gl.FLOAT,2,false],[shaders.semantic.COLOR,gl.FLOAT,4,false],[shaders.semantic.TEXCOORD,gl.FLOAT,2,false]],[],null,geom.QUADS)
sprite_buffer=new Float32Array(1024)
sprite_buffer_len=sprite_buffer.length/8}profilerStart("sort")
sprite_queue.sort(cmpSprite)
geom_stats.sprite_sort_elems+=sprite_queue.length
profilerStop("sort")
batch_state=null
assert.equal(sprite_buffer_idx,0)
assert.equal(sprite_buffer_batch_start,0)
assert.equal(batches.length,0)}function growSpriteBuffer(){var new_length=min(sprite_buffer_len*1.25+3&~3,MAX_VERT_COUNT)
sprite_buffer_len=new_length
sprite_buffer=new Float32Array(new_length*8)}function drawElem(elem){var count=0
if(elem.fn){commitAndFlush()
batch_state=null
elem.fn()
last_bound_shader=-1
last_blend_mode=-1
assert.equal(sprite_buffer_idx,0)
assert.equal(sprite_buffer_batch_start,0)
assert.equal(batches.length,0)
clip_space[0]=2/engine.viewport[2]
clip_space[1]=-2/engine.viewport[3]
count++}else{if(!batch_state||cmpTextureArray(elem.texs,batch_state.texs)||elem.shader!==batch_state.shader||elem.shader_params!==batch_state.shader_params||elem.blend!==batch_state.blend){commit()
batch_state=elem}do{if(sprite_buffer_idx+4>sprite_buffer_len){commitAndFlush()
if(sprite_buffer_len!==MAX_VERT_COUNT){growSpriteBuffer()}}var index=sprite_buffer_idx*8
sprite_buffer_idx+=4
sprite_buffer.set(elem.data,index)
count++
sprite_freelist.push(elem)
var next=elem.next
elem.next=null
elem=next}while(elem)}return count}function finishDraw(){commitAndFlush()
blendModeReset()}function draw(){profilerStart("sprites:draw")
drawSetup()
profilerStart("drawElem")
for(var ii=0;ii<sprite_queue.length;++ii){var elem=sprite_queue[ii]
drawElem(elem)}profilerStop("drawElem")
sprite_queue.length=0
finishDraw()
profilerStop("sprites:draw")}function drawPartial(z){profilerStart("sprites:drawPartial")
drawSetup()
profilerStart("drawElem")
for(var ii=0;ii<sprite_queue.length;++ii){var elem=sprite_queue[ii]
if(elem.z>z){sprite_queue=sprite_queue.slice(ii)
break}drawElem(elem)}profilerStop("drawElem")
finishDraw()
profilerStop("sprites:drawPartial")}function buildRects(ws,hs,tex){var rects=[]
var total_w=0
for(var ii=0;ii<ws.length;++ii){total_w+=ws[ii]}var total_h=0
for(var _ii=0;_ii<hs.length;++_ii){total_h+=hs[_ii]}var tex_w
var tex_h
if(!tex||nextHighestPowerOfTwo(tex.src_width)===tex.width&&nextHighestPowerOfTwo(tex.src_height)===tex.height){tex_w=nextHighestPowerOfTwo(total_w)
tex_h=nextHighestPowerOfTwo(total_h)}else{tex_w=total_w
tex_h=total_h}var wh=[]
for(var _ii2=0;_ii2<ws.length;++_ii2){wh.push(ws[_ii2]/total_h)}var hw=[]
for(var _ii3=0;_ii3<hs.length;++_ii3){hw.push(hs[_ii3]/total_w)}var aspect=[]
var non_square=false
var y=0
for(var jj=0;jj<hs.length;++jj){var x=0
for(var _ii4=0;_ii4<ws.length;++_ii4){var r=vec4(x/tex_w,y/tex_h,(x+ws[_ii4])/tex_w,(y+hs[jj])/tex_h)
rects.push(r)
var asp=ws[_ii4]/hs[jj]
if(asp!==1){non_square=true}aspect.push(asp)
x+=ws[_ii4]}y+=hs[jj]}return{widths:ws,heights:hs,wh:wh,hw:hw,rects:rects,aspect:non_square?aspect:null,total_w:total_w,total_h:total_h}}function Sprite(params){var _this=this
if(params.texs){this.texs=params.texs}else{var ext=params.ext||".png"
this.texs=[]
if(params.tex){this.texs.push(params.tex)}else if(params.layers){assert(params.name)
this.texs=[]
for(var ii=0;ii<params.layers;++ii){this.texs.push(textures.load({url:"img/"+params.name+"_"+ii+ext,filter_min:params.filter_min,filter_mag:params.filter_mag,wrap_s:params.wrap_s,wrap_t:params.wrap_t}))}}else if(params.name){this.texs.push(textures.load({url:"img/"+params.name+ext,filter_min:params.filter_min,filter_mag:params.filter_mag,wrap_s:params.wrap_s,wrap_t:params.wrap_t}))}else{assert(params.url)
this.texs.push(textures.load(params))}}this.origin=params.origin||vec2(0,0)
this.size=params.size||vec2(1,1)
this.color=params.color||vec4(1,1,1,1)
this.uvs=params.uvs||vec4(0,0,1,1)
if(!params.uvs){this.texs[0].onLoad(function(tex){_this.uvs[2]=tex.src_width/tex.width
_this.uvs[3]=tex.src_height/tex.height})}if(params.ws){this.uidata=buildRects(params.ws,params.hs)
this.texs[0].onLoad(function(tex){_this.uidata=buildRects(params.ws,params.hs,tex)})}this.shader=params.shader||null}Sprite.prototype.draw=function(params){if(params.w===0||params.h===0){return null}var w=(params.w||1)*this.size[0]
var h=(params.h||1)*this.size[1]
var uvs=typeof params.frame==="number"?this.uidata.rects[params.frame]:params.uvs||this.uvs
var color=params.color||this.color
qsp.sprite=this
qsp.x=params.x
qsp.y=params.y
qsp.z=params.z||Z.UI
qsp.w=w
qsp.h=h
qsp.rot=params.rot
qsp.uvs=uvs
qsp.color_ul=color
qsp.color_ll=color
qsp.color_lr=color
qsp.color_ur=color
qsp.shader=params.shader||this.shader
qsp.shader_params=params.shader_params
qsp.nozoom=params.nozoom
qsp.pixel_perfect=params.pixel_perfect
qsp.blend=params.blend
return queuesprite4colorObj(qsp)}
Sprite.prototype.drawDualTint=function(params){params.shader=sprite_dual_fshader
params.shader_params={color1:params.color1}
return this.draw(params)}
Sprite.prototype.draw4Color=function(params){if(params.w===0||params.h===0){return null}var w=(params.w||1)*this.size[0]
var h=(params.h||1)*this.size[1]
var uvs=typeof params.frame==="number"?this.uidata.rects[params.frame]:params.uvs||this.uvs
qsp.sprite=this
qsp.x=params.x
qsp.y=params.y
qsp.z=params.z||Z.UI
qsp.w=w
qsp.h=h
qsp.rot=params.rot
qsp.uvs=uvs
qsp.color_ul=params.color_ul
qsp.color_ll=params.color_ll
qsp.color_lr=params.color_lr
qsp.color_ur=params.color_ur
qsp.shader=params.shader||this.shader
qsp.shader_params=params.shader_params
qsp.nozoom=params.nozoom
qsp.pixel_perfect=params.pixel_perfect
qsp.blend=params.blend
return queuesprite4colorObj(qsp)}
function create(params){return new Sprite(params)}function startup(){geom_stats=geom.stats
clip_space[2]=-1
clip_space[3]=1
exports.sprite_vshader=sprite_vshader=shaders.create("shaders/sprite.vp")
exports.sprite_fshader=sprite_fshader=shaders.create("shaders/sprite.fp")
sprite_dual_fshader=shaders.create("shaders/sprite_dual.fp")
shaders.prelink(sprite_vshader,sprite_fshader)
shaders.prelink(sprite_vshader,sprite_dual_fshader)}

},{"../common/util.js":89,"../common/vmath.js":91,"./camera2d.js":13,"./engine.js":20,"./geom.js":28,"./shaders.js":57,"./textures.js":67,"assert":undefined}],66:[function(require,module,exports){
"use strict"
exports.create=create
var assert=require("assert")
var _require=require("../common/chunked_send.js"),chunkedReceiverFinish=_require.chunkedReceiverFinish,chunkedReceiverInit=_require.chunkedReceiverInit,chunkedReceiverOnChunk=_require.chunkedReceiverOnChunk,chunkedReceiverStart=_require.chunkedReceiverStart,chunkedReceiverFreeFile=_require.chunkedReceiverFreeFile,chunkedReceiverGetFile=_require.chunkedReceiverGetFile
var _glovClientClient_configJs=require("./client_config.js")
var PLATFORM_FBINSTANT=_glovClientClient_configJs.PLATFORM_FBINSTANT
var dot_prop=require("../common/dot-prop.js")
var EventEmitter=require("../common/tiny-events.js")
var _require2=require("./fbinstant.js"),fbGetLoginInfo=_require2.fbGetLoginInfo
var local_storage=require("./local_storage.js")
var md5=require("../common/md5.js")
var _require3=require("./net.js"),netDisconnected=_require3.netDisconnected
var _require4=require("../common/packet.js"),isPacket=_require4.isPacket
var _require5=require("../common/perfcounters.js"),perfCounterAdd=_require5.perfCounterAdd
var util=require("../common/util.js")
var errorString=util.errorString
var walltime=require("./walltime.js")
function ClientChannelWorker(subs,channel_id,base_handlers){EventEmitter.call(this)
this.subs=subs
this.channel_id=channel_id
this.subscriptions=0
this.subscribe_failed=false
this.got_subscribe=false
this.immediate_subscribe=0
this.channel_data_ver=0
this.handlers=Object.create(base_handlers)
this.data={}}util.inherits(ClientChannelWorker,EventEmitter)
ClientChannelWorker.prototype.onSubscribe=function(cb){assert(this.subscriptions||this.autosubscribed)
this.on("subscribe",cb)
if(this.got_subscribe){cb(this.data)}}
ClientChannelWorker.prototype.onceSubscribe=function(cb){assert(this.subscriptions||this.autosubscribed)
if(this.got_subscribe){cb(this.data)}else{this.once("subscribe",cb)}}
ClientChannelWorker.prototype.handleChannelData=function(data,resp_func){var _this=this
console.log("got channel_data("+this.channel_id+"):  "+JSON.stringify(data))
this.data=data;++this.channel_data_ver
this.emit("channel_data",this.data)
this.got_subscribe=true
this.emit("subscribe",this.data)
var channel_type=this.channel_id.split(".")[0]
var cmd_list=this.subs.cmds_fetched_by_type
if(cmd_list&&!cmd_list[channel_type]){cmd_list[channel_type]=true
this.send("cmdparse","cmd_list",function(err,resp){if(err){console.error("Error getting cmd_list for "+channel_type)
delete cmd_list[channel_type]}else{_this.subs.cmd_parse.addServerCommands(resp)}})}resp_func()}
ClientChannelWorker.prototype.handleApplyChannelData=function(data,resp_func){if(data.value===undefined){dot_prop.delete(this.data,data.key)}else{dot_prop.set(this.data,data.key,data.value)}++this.channel_data_ver
this.emit("channel_data",this.data,data.key,data.value)
resp_func()}
ClientChannelWorker.prototype.handleBatchSet=function(data,resp_func){for(var ii=0;ii<data.length;++ii){var _data$ii=data[ii],key=_data$ii[0],value=_data$ii[1]
if(value===undefined){dot_prop.delete(this.data.public,key)}else{dot_prop.set(this.data.public,key,value)}++this.channel_data_ver
this.emit("channel_data",this.data,"public."+key,value)}resp_func()}
ClientChannelWorker.prototype.getChannelData=function(key,default_value){return dot_prop.get(this.data,key,default_value)}
ClientChannelWorker.prototype.setChannelData=function(key,value,skip_predict,resp_func){if(!skip_predict){dot_prop.set(this.data,key,value)}var q=value&&value.q||undefined
var pak=this.subs.client.pak("set_channel_data")
pak.writeAnsiString(this.channel_id)
pak.writeBool(q)
pak.writeAnsiString(key)
pak.writeJSON(value)
pak.send(resp_func)}
ClientChannelWorker.prototype.removeMsgHandler=function(msg,cb){assert(this.handlers[msg]===cb)
delete this.handlers[msg]}
ClientChannelWorker.prototype.onMsg=function(msg,cb){assert(!this.handlers[msg]||this.handlers[msg]===cb)
this.handlers[msg]=cb}
ClientChannelWorker.prototype.pak=function(msg){var pak=this.subs.client.pak("channel_msg")
pak.writeAnsiString(this.channel_id)
pak.writeAnsiString(msg)
return pak}
ClientChannelWorker.prototype.send=function(msg,data,resp_func,old_fourth){assert(!resp_func||typeof resp_func==="function")
assert(!old_fourth)
this.subs.client.send("channel_msg",{channel_id:this.channel_id,msg:msg,data:data},resp_func)}
ClientChannelWorker.prototype.cmdParse=function(cmd,resp_func){this.send("cmdparse",cmd,resp_func)}
function SubscriptionManager(client,cmd_parse){EventEmitter.call(this)
this.client=client
this.channels={}
this.logged_in=false
this.login_credentials=null
this.logged_in_username=null
this.was_logged_in=false
this.logging_in=false
this.logging_out=false
this.auto_create_user=false
this.allow_anon=false
this.no_auto_login=false
this.cmd_parse=cmd_parse
if(cmd_parse){this.cmds_fetched_by_type={}}this.base_handlers={}
this.channel_handlers={}
this.first_connect=true
this.server_time=0
this.server_time_interp=0
this.cack_data={}
client.onMsg("connect",this.handleConnect.bind(this))
client.onMsg("disconnect",this.handleDisconnect.bind(this))
client.onMsg("channel_msg",this.handleChannelMessage.bind(this))
client.onMsg("server_time",this.handleServerTime.bind(this))
client.onMsg("chat_broadcast",this.handleChatBroadcast.bind(this))
client.onMsg("restarting",this.handleRestarting.bind(this))
if(cmd_parse){client.onMsg("csr_to_client",this.handleCSRToClient.bind(this))}this.chunked=null
client.onMsg("upload_start",this.handleUploadStart.bind(this))
client.onMsg("upload_chunk",this.handleUploadChunk.bind(this))
client.onMsg("upload_finish",this.handleUploadFinish.bind(this))
this.onChannelMsg(null,"channel_data",ClientChannelWorker.prototype.handleChannelData)
this.onChannelMsg(null,"apply_channel_data",ClientChannelWorker.prototype.handleApplyChannelData)
this.onChannelMsg(null,"batch_set",ClientChannelWorker.prototype.handleBatchSet)}util.inherits(SubscriptionManager,EventEmitter)
SubscriptionManager.prototype.onceConnected=function(cb){if(this.client.connected&&this.client.socket.readyState===1){return void cb()}this.once("connect",cb)}
SubscriptionManager.prototype.getBaseHandlers=function(channel_type){var handlers=this.channel_handlers[channel_type]
if(!handlers){handlers=this.channel_handlers[channel_type]=Object.create(this.base_handlers)}return handlers}
SubscriptionManager.prototype.onChannelMsg=function(channel_type,msg,cb){var handlers=channel_type?this.getBaseHandlers(channel_type):this.base_handlers
assert(!handlers[msg])
handlers[msg]=cb}
SubscriptionManager.prototype.handleChatBroadcast=function(data){console.error("["+data.src+"] "+data.msg)
this.emit("chat_broadcast",data)}
SubscriptionManager.prototype.handleRestarting=function(data){this.restarting=data
this.emit("restarting",data)}
SubscriptionManager.prototype.handleDisconnect=function(data){this.emit("disconnect",data)}
SubscriptionManager.prototype.handleConnect=function(data){var _this2=this
var reconnect=false
if(this.first_connect){this.first_connect=false}else{reconnect=true}this.restarting=Boolean(data.restarting)
this.cack_data=data
walltime.sync(data.time)
if(!this.client.connected||this.client.socket.readyState!==1){return}var subs=this
function resub(){var _loop=function _loop(channel_id){var channel=subs.channels[channel_id]
if(channel.subscriptions){subs.client.send("subscribe",channel_id,function(err){if(err){channel.subscribe_failed=true
console.error("Error subscribing to "+channel_id+": "+err)
channel.emit("subscribe_fail",err)}})}}
for(var channel_id in subs.channels){_loop(channel_id)}subs.emit("connect",reconnect)}if(this.logging_in){}else if(this.was_logged_in){this.loginInternal(this.login_credentials,function(err){if(err&&err==="ERR_FAILALL_DISCONNECT"){}else if(err){var credentials_str=_this2.login_credentials&&_this2.login_credentials.password?"user_id, password":JSON.stringify(_this2.login_credentials)
assert(false,"Login failed for "+credentials_str+": "+errorString(err))}else{resub()}})}else if(!this.no_auto_login){var auto_login_enabled=PLATFORM_FBINSTANT
if(auto_login_enabled){var login_cb=function login_cb(){}
if(PLATFORM_FBINSTANT){this.loginFacebook(login_cb)}}else if(local_storage.get("name")&&local_storage.get("password")){this.login(local_storage.get("name"),local_storage.get("password"),function(){})}resub()}else{resub()}this.fetchCmds()}
SubscriptionManager.prototype.fetchCmds=function(){var _this3=this
var channel_type="client"
var cmd_list=this.cmds_fetched_by_type
if(cmd_list&&!cmd_list[channel_type]){cmd_list[channel_type]=true
this.client.send("cmd_parse_list_client",null,function(err,resp){if(!err){_this3.cmd_parse.addServerCommands(resp)}})}}
SubscriptionManager.prototype.handleChannelMessage=function(pak,resp_func){assert(isPacket(pak))
var channel_id=pak.readAnsiString()
var msg=pak.readAnsiString()
var is_packet=pak.readBool()
var data=is_packet?pak:pak.readJSON()
if(!data||!data.q){var debug_msg
if(!is_packet){debug_msg=JSON.stringify(data)}else if(typeof data.contents==="function"){debug_msg=data.contents()}else{debug_msg="(pak)"}console.log("got channel_msg("+channel_id+") "+msg+": "+debug_msg)}var channel=this.getChannel(channel_id)
var handler=channel.handlers[msg]
if(!handler){console.error("no handler for channel_msg("+channel_id+") "+msg+": "+JSON.stringify(data))
return}perfCounterAdd("cm."+channel_id.split(".")[0]+"."+msg)
handler.call(channel,data,resp_func)}
SubscriptionManager.prototype.handleServerTime=function(pak){this.server_time=pak.readInt()
if(this.server_time<this.server_time_interp&&this.server_time>this.server_time_interp-250){}else{this.server_time_interp=this.server_time}walltime.sync(pak.readInt())}
SubscriptionManager.prototype.getServerTime=function(){return this.server_time_interp}
SubscriptionManager.prototype.tick=function(dt){this.server_time_interp+=dt
for(var channel_id in this.channels){var channel=this.channels[channel_id]
if(channel.immediate_subscribe){if(dt>=channel.immediate_subscribe){channel.immediate_subscribe=0
this.unsubscribe(channel_id)}else{channel.immediate_subscribe-=dt}}}}
SubscriptionManager.prototype.onUploadProgress=function(mime_type,cb){var _this4=this
if(!this.upload_progress_cbs){this.upload_progress_cbs={}}assert(!this.upload_progress_cbs[mime_type])
this.upload_progress_cbs[mime_type]=cb
if(!this.chunked){this.chunked=chunkedReceiverInit("client_receive",Infinity)}if(!this.chunked.on_progress){this.chunked.on_progress=function(progress,total,type){if(_this4.upload_progress_cbs[type]){_this4.upload_progress_cbs[type](progress,total)}}}}
SubscriptionManager.prototype.handleUploadStart=function(pak,resp_func){if(!this.chunked){this.chunked=chunkedReceiverInit("client_receive",Infinity)}chunkedReceiverStart(this.chunked,pak,resp_func)}
SubscriptionManager.prototype.handleUploadChunk=function(pak,resp_func){chunkedReceiverOnChunk(this.chunked,pak,resp_func)}
SubscriptionManager.prototype.handleUploadFinish=function(pak,resp_func){chunkedReceiverFinish(this.chunked,pak,resp_func)}
SubscriptionManager.prototype.uploadGetFile=function(file_id){return chunkedReceiverGetFile(this.chunked,file_id)}
SubscriptionManager.prototype.uploadFreeFile=function(file_data){return chunkedReceiverFreeFile(file_data)}
SubscriptionManager.prototype.subscribe=function(channel_id){this.getChannel(channel_id,true)}
SubscriptionManager.prototype.getChannel=function(channel_id,do_subscribe){var channel=this.channels[channel_id]
if(!channel){var channel_type=channel_id.split(".")[0]
var handlers=this.getBaseHandlers(channel_type)
channel=this.channels[channel_id]=new ClientChannelWorker(this,channel_id,handlers)}if(do_subscribe){channel.subscriptions++
if(!netDisconnected()&&channel.subscriptions===1){channel.subscribe_failed=false
this.client.send("subscribe",channel_id,function(err){if(err){channel.subscribe_failed=true
console.error("Error subscribing to "+channel_id+": "+err)
channel.emit("subscribe_fail",err)}})}}return channel}
SubscriptionManager.prototype.getUserId=function(){return this.loggedIn()}
SubscriptionManager.prototype.getMyUserChannel=function(){var user_id=this.loggedIn()
if(!user_id){return null}var channel=this.getChannel("user."+user_id)
if(!this.logging_out){channel.autosubscribed=true}return channel}
SubscriptionManager.prototype.unsubscribe=function(channel_id){var channel=this.channels[channel_id]
assert(channel)
assert(channel.subscriptions)
channel.subscriptions--
if(!channel.subscriptions){channel.got_subscribe=false}if(!netDisconnected()&&!channel.subscriptions&&!channel.subscribe_failed){this.client.send("unsubscribe",channel_id)}}
SubscriptionManager.prototype.getChannelImmediate=function(channel_id,timeout){timeout=timeout||6e4
var channel=this.getChannel(channel_id)
if(!channel.immediate_subscribe){this.subscribe(channel_id)}channel.immediate_subscribe=timeout
return channel}
SubscriptionManager.prototype.onLogin=function(cb){this.on("login",cb)
if(this.logged_in){return void cb()}}
SubscriptionManager.prototype.loggedIn=function(){return this.logging_out?false:this.logged_in?this.logged_in_username||"missing_name":false}
SubscriptionManager.prototype.userOnChannelData=function(expected_user_id,data,key,value){if(expected_user_id!==this.getUserId()){return}if(key==="public.display_name"){this.logged_in_display_name=value}}
SubscriptionManager.prototype.handleLoginResponse=function(resp_func,err,resp){var _this5=this
this.logging_in=false
if(!err){this.logged_in_username=resp.user_id
this.logged_in_display_name=resp.display_name
this.logged_in=true
this.was_logged_in=true
var user_channel=this.getMyUserChannel()
user_channel.onceSubscribe(function(){if(!_this5.did_master_subscribe&&user_channel.getChannelData("public.permissions.sysadmin")){_this5.did_master_subscribe=true
_this5.subscribe("master.master")}})
if(!user_channel.subs_added_user_on_channel_data){user_channel.on("channel_data",this.userOnChannelData.bind(this,this.logged_in_username))
user_channel.subs_added_user_on_channel_data=true}this.emit("login")}else{this.emit("login_fail",err)}resp_func(err)}
SubscriptionManager.prototype.loginInternal=function(login_credentials,resp_func){var _this6=this
if(this.logging_in){return void resp_func("Login already in progress")}this.logging_in=true
this.logged_in=false
if(login_credentials.fb){fbGetLoginInfo(function(err,result){if(err){return void _this6.handleLoginResponse(resp_func,err)}if(!_this6.client.connected){return void _this6.handleLoginResponse(resp_func,"ERR_DISCONNECTED")}_this6.client.send("login_facebook_instant",result,_this6.handleLoginResponse.bind(_this6,resp_func))})}else{this.client.send("login",{user_id:login_credentials.user_id,password:md5(this.client.secret+login_credentials.password)},this.handleLoginResponse.bind(this,resp_func))}}
SubscriptionManager.prototype.userCreateInternal=function(params,resp_func){if(this.logging_in){return resp_func("Login already in progress")}this.logging_in=true
this.logged_in=false
return this.client.send("user_create",params,this.handleLoginResponse.bind(this,resp_func))}
function hashedPassword(user_id,password){if(password.split("$$")[0]==="prehashed"){password=password.split("$$")[1]}else{password=md5(md5(user_id.toLowerCase())+password)}return password}SubscriptionManager.prototype.login=function(username,password,resp_func){var _this7=this
username=(username||"").trim()
if(!username){return resp_func("Missing username")}password=(password||"").trim()
if(!password){return resp_func("Missing password")}var hashed_password=hashedPassword(username,password)
if(hashed_password!==password){local_storage.set("password","prehashed$$"+hashed_password)}this.login_credentials={user_id:username,password:hashed_password}
if(!this.auto_create_user){return this.loginInternal(this.login_credentials,resp_func)}return this.loginInternal(this.login_credentials,function(err,data){if(!err||err!=="ERR_USER_NOT_FOUND"){return void resp_func(err,data)}_this7.userCreate({user_id:username,password:password,password_confirm:password,email:"autocreate@glovjs.org"},resp_func)})}
SubscriptionManager.prototype.loginFacebook=function(resp_func){this.login_credentials={fb:true}
return this.loginInternal(this.login_credentials,resp_func)}
SubscriptionManager.prototype.userCreate=function(params,resp_func){params.user_id=(params.user_id||"").trim()
if(!params.user_id){return resp_func("Missing username")}params.password=(params.password||"").trim()
if(!params.password){return resp_func("Missing password")}params.password_confirm=(params.password_confirm||"").trim()
if(!this.auto_create_user&&!params.password_confirm){return resp_func("Missing password confirmation")}params.email=(params.email||"").trim()
if(!this.auto_create_user&&!params.email){return resp_func("Missing email")}params.display_name=(params.display_name||"").trim()
var hashed_password=hashedPassword(params.user_id,params.password)
if(hashed_password!==params.password){local_storage.set("password","prehashed$$"+hashed_password)}var hashed_password_confirm=hashedPassword(params.user_id,params.password_confirm)
if(hashed_password!==hashed_password_confirm){return resp_func("Passwords do not match")}this.login_credentials={user_id:params.user_id,password:hashed_password}
return this.userCreateInternal({display_name:params.display_name||params.user_id,user_id:params.user_id,email:params.email,password:hashed_password},resp_func)}
SubscriptionManager.prototype.logout=function(){var _this8=this
assert(this.logged_in)
assert(!this.logging_in)
assert(!this.logging_out)
if(this.did_master_subscribe){this.did_master_subscribe=false
this.unsubscribe("master.master")}for(var channel_id in this.channels){var channel=this.channels[channel_id]
if(channel.immediate_subscribe){channel.immediate_subscribe=0
this.unsubscribe(channel_id)}assert(!channel.subscriptions,"Remaining active subscription for "+channel_id)
if(channel.autosubscribed){channel.autosubscribed=false}}this.logging_out=true
this.client.send("logout",null,function(err){_this8.logging_out=false
if(!err){local_storage.set("password",undefined)
_this8.logged_in=false
_this8.logged_in_username=null
_this8.was_logged_in=false
_this8.login_credentials=null
_this8.emit("logout")}})}
SubscriptionManager.prototype.serverLog=function(type,data){var _this9=this
this.onceConnected(function(){_this9.client.send("log",{type:type,data:data})})}
SubscriptionManager.prototype.sendCmdParse=function(command,resp_func){var _this10=this
this.onceConnected(function(){var pak=_this10.client.pak("cmd_parse_auto")
pak.writeString(command)
pak.send(resp_func)})}
SubscriptionManager.prototype.handleCSRToClient=function(pak,resp_func){var _this11=this
var cmd=pak.readString()
var access=pak.readJSON()
this.cmd_parse.handle({access:access},cmd,function(err,resp){if(err&&_this11.cmd_parse.was_not_found){return resp_func(null,{found:0,err:err})}return resp_func(err,{found:1,resp:resp})})}
function create(client,cmd_parse){return new SubscriptionManager(client,cmd_parse)}

},{"../common/chunked_send.js":78,"../common/dot-prop.js":81,"../common/md5.js":84,"../common/packet.js":85,"../common/perfcounters.js":86,"../common/tiny-events.js":88,"../common/util.js":89,"./client_config.js":15,"./fbinstant.js":23,"./local_storage.js":38,"./net.js":43,"./walltime.js":72,"assert":undefined}],67:[function(require,module,exports){
"use strict"
exports.bind=bind
exports.bindArray=bindArray
exports.cmpTextureArray=cmpTextureArray
exports.cname=cname
exports.createForCapture=createForCapture
exports.createForDepthCapture=createForDepthCapture
exports.defaultFilters=defaultFilters
exports.findTexForReplacement=findTexForReplacement
exports.format=void 0
exports.isArrayBound=isArrayBound
exports.load=load
exports.load_count=void 0
exports.startup=startup
exports.textureSupportsDepth=textureSupportsDepth
exports.textures=void 0
exports.texturesResetState=texturesResetState
exports.texturesTick=texturesTick
exports.texturesUnloadDynamic=texturesUnloadDynamic
exports.textureLoad=load
var assert=require("assert")
var engine=require("./engine.js")
var _require=require("./filewatch.js"),filewatchOn=_require.filewatchOn
var local_storage=require("./local_storage.js")
var settings=require("./settings.js")
var urlhash=require("./urlhash.js")
var _require2=require("../common/util.js"),callEach=_require2.callEach,isPowerOfTwo=_require2.isPowerOfTwo,nextHighestPowerOfTwo=_require2.nextHighestPowerOfTwo,ridx=_require2.ridx
var TEX_UNLOAD_TIME=5*60*1e3
var textures={}
exports.textures=textures
var load_count=0
exports.load_count=load_count
var aniso=4
var max_aniso=0
var aniso_enum
var default_filter_min
var default_filter_mag
var cube_faces=[{target:"TEXTURE_CUBE_MAP_NEGATIVE_X",pos:[0,1]},{target:"TEXTURE_CUBE_MAP_POSITIVE_X",pos:[0,0]},{target:"TEXTURE_CUBE_MAP_NEGATIVE_Y",pos:[1,0]},{target:"TEXTURE_CUBE_MAP_POSITIVE_Y",pos:[1,1]},{target:"TEXTURE_CUBE_MAP_NEGATIVE_Z",pos:[2,0]},{target:"TEXTURE_CUBE_MAP_POSITIVE_Z",pos:[2,1]}]
var format={R8:{count:1},RGB8:{count:3},RGBA8:{count:4},DEPTH16:{count:1},DEPTH24:{count:1}}
exports.format=format
function defaultFilters(min,mag){default_filter_min=min
default_filter_mag=mag}var bound_unit=null
var bound_tex=[]
var handle_loading
var handle_error
var frame_timestamp
function setUnit(unit){if(unit!==bound_unit){gl.activeTexture(gl.TEXTURE0+unit)
bound_unit=unit}}function bindHandle(unit,target,handle){if(bound_tex[unit]!==handle){setUnit(unit)
gl.bindTexture(target,handle)
bound_tex[unit]=handle}}function unbindAll(target){for(var unit=0;unit<bound_tex.length;++unit){setUnit(unit)
gl.bindTexture(target,target===gl.TEXTURE_2D?handle_loading:null)
bound_tex[unit]=null}}function bind(unit,tex){tex.last_use=frame_timestamp
bindHandle(unit,tex.target,tex.eff_handle)}function bindArray(texs){for(var ii=0;ii<texs.length;++ii){var tex=texs[ii]
tex.last_use=frame_timestamp
var handle=tex.eff_handle
if(bound_tex[ii]!==handle){if(ii!==bound_unit){gl.activeTexture(gl.TEXTURE0+ii)
bound_unit=ii}gl.bindTexture(tex.target,handle)
bound_tex[ii]=handle}}}function cmpTextureArray(texsa,texsb){var d=texsa.length-texsb.length
if(d){return d}for(var ii=0;ii<texsa.length;++ii){d=texsa[ii].id-texsb[ii].id
if(d){return d}}return 0}function isArrayBound(texs){for(var ii=0;ii<texs.length;++ii){var tex=texs[ii]
var handle=tex.eff_handle
if(bound_tex[ii]!==handle){return false}}return true}function texturesResetState(){bound_unit=-1
if(engine.webgl2){unbindAll(gl.TEXTURE_2D_ARRAY)}unbindAll(gl.TEXTURE_2D)
setUnit(0)}var auto_unload_textures=[]
var last_id=0
function Texture(params){this.id=++last_id
this.name=params.name
this.loaded=false
this.load_fail=false
this.target=params.target||gl.TEXTURE_2D
this.is_array=this.target===gl.TEXTURE_2D_ARRAY
this.is_cube=this.target===gl.TEXTURE_CUBE_MAP
this.handle=gl.createTexture()
this.eff_handle=handle_loading
this.setSamplerState(params)
this.src_width=this.src_height=1
this.width=this.height=1
this.nozoom=params.nozoom||false
this.on_load=[]
this.gpu_mem=0
this.soft_error=params.soft_error||false
this.last_use=frame_timestamp
this.auto_unload=params.auto_unload||false
if(this.auto_unload){auto_unload_textures.push(this)}this.format=params.format||format.RGBA8
if(params.data){var err=this.updateData(params.width,params.height,params.data)
if(err){assert(false,"Error loading "+params.name+": "+err)}}else{unbindAll(this.target)
if(params.url){this.url=params.url
this.loadURL(params.url)}}}Texture.prototype.updateGPUMem=function(){var new_size=this.width*this.height*this.format.count
if(this.mipmaps){new_size*=1.5}var diff=new_size-this.gpu_mem
engine.perf_state.gpu_mem.tex+=diff
this.gpu_mem=diff}
function bindForced(tex){var target=tex.target
setUnit(0)
bound_tex[0]=null
bindHandle(0,target,tex.handle)}Texture.prototype.setSamplerState=function(params){var target=this.target
bindForced(this)
this.filter_min=params.filter_min||default_filter_min
this.filter_mag=params.filter_mag||default_filter_mag
gl.texParameteri(target,gl.TEXTURE_MIN_FILTER,this.filter_min)
gl.texParameteri(target,gl.TEXTURE_MAG_FILTER,this.filter_mag)
this.wrap_s=params.wrap_s||gl.REPEAT
this.wrap_t=params.wrap_t||gl.REPEAT
gl.texParameteri(target,gl.TEXTURE_WRAP_S,this.wrap_s)
gl.texParameteri(target,gl.TEXTURE_WRAP_T,this.wrap_t)
this.mipmaps=this.filter_min>=9984&&this.filter_min<=9987||params.force_mipmaps
if(max_aniso){if(this.mipmaps&&params.filter_mag!==gl.NEAREST){gl.texParameterf(gl.TEXTURE_2D,aniso_enum,aniso)}else{gl.texParameterf(gl.TEXTURE_2D,aniso_enum,1)}}}
Texture.prototype.updateData=function updateData(w,h,data){profilerStart("Texture:updateData")
assert(!this.destroyed)
bindForced(this)
this.last_use=frame_timestamp
this.src_width=w
this.src_height=h
this.width=w
this.height=h
for(var ii=0;ii<10&&gl.getError();++ii){}var np2=(!isPowerOfTwo(w)||!isPowerOfTwo(h))&&!this.is_array&&!this.is_cube&&!(!this.mipmaps&&this.wrap_s===gl.CLAMP_TO_EDGE&&this.wrap_t===gl.CLAMP_TO_EDGE)
if(np2){this.width=nextHighestPowerOfTwo(w)
this.height=nextHighestPowerOfTwo(h)
gl.texImage2D(this.target,0,this.format.internal_type,this.width,this.height,0,this.format.internal_type,this.format.gl_type,null)}if(data instanceof Uint8Array){assert(data.length>=w*h*this.format.count)
assert(!this.is_cube)
if(this.is_array){var num_images=h/w
gl.texImage3D(this.target,0,this.format.internal_type,w,w,num_images,0,this.format.internal_type,this.format.gl_type,data)}else if(np2){gl.texSubImage2D(this.target,0,0,0,w,h,this.format.internal_type,this.format.gl_type,data)}else{gl.texImage2D(this.target,0,this.format.internal_type,w,h,0,this.format.internal_type,this.format.gl_type,data)}}else{if(!data.width){profilerStop()
return"Missing width ("+data.width+') ("'+String(data).slice(0,100)+'")'}if(this.is_cube){assert.equal(w*2,h*3)
var tex_size=h/2
var canvas=document.createElement("canvas")
canvas.width=tex_size
canvas.height=tex_size
var ctx=canvas.getContext("2d")
for(var _ii=0;_ii<cube_faces.length;++_ii){var face=cube_faces[_ii]
ctx.drawImage(data,face.pos[0]*tex_size,face.pos[1]*tex_size,tex_size,tex_size,0,0,tex_size,tex_size)
gl.texImage2D(gl[face.target],0,this.format.internal_type,this.format.internal_type,this.format.gl_type,canvas)}}else if(this.is_array){var _num_images=h/w
gl.texImage3D(this.target,0,this.format.internal_type,w,w,_num_images,0,this.format.internal_type,this.format.gl_type,data)
if(gl.getError()){var _canvas=document.createElement("canvas")
_canvas.width=w
_canvas.height=h
var _ctx=_canvas.getContext("2d")
_ctx.drawImage(data,0,0)
gl.texImage3D(this.target,0,this.format.internal_type,w,w,_num_images,0,this.format.internal_type,this.format.gl_type,_canvas)}}else if(np2){if(w!==this.width){gl.texSubImage2D(this.target,0,1,0,this.format.internal_type,this.format.gl_type,data)}if(h!==this.height){gl.texSubImage2D(this.target,0,0,1,this.format.internal_type,this.format.gl_type,data)}gl.texSubImage2D(this.target,0,0,0,this.format.internal_type,this.format.gl_type,data)}else{gl.texImage2D(this.target,0,this.format.internal_type,this.format.internal_type,this.format.gl_type,data)}}var err=null
var gl_err=gl.getError()
if(gl_err){err="GLError("+gl_err+")"}if(!err&&this.mipmaps){gl.generateMipmap(this.target)
gl_err=gl.getError()
if(gl_err){err="GLError("+gl_err+")"}}if(!err){this.updateGPUMem()
this.eff_handle=this.handle
this.loaded=true
callEach(this.on_load,this.on_load=null,this)}profilerStop()
return err}
Texture.prototype.onLoad=function(cb){if(this.loaded){cb(this)}else{this.on_load.push(cb)}}
var TEX_RETRY_COUNT=4
Texture.prototype.loadURL=function loadURL(url,filter){var tex=this
assert(!tex.destroyed)
if(!url.match(/^.{2,7}:/)){url=""+urlhash.getURLBase()+url}var load_gen=tex.load_gen=(tex.load_gen||0)+1
function tryLoad(next){profilerStart("Texture:tryLoad")
var did_next=false
function done(img){if(!did_next){did_next=true
return void next(img)}}var img=new Image
img.onload=function(){profilerStart("Texture:onload")
done(img)
profilerStop()}
function fail(){done(null)}img.onerror=fail
img.crossOrigin="anonymous"
img.src=url
profilerStop()}exports.load_count=++load_count
var retries=0
function handleLoad(img){if(tex.load_gen!==load_gen||tex.destroyed){exports.load_count=--load_count
return}var err_details=""
if(img){tex.format=format.RGBA8
if(filter){img=filter(tex,img)}var _err=tex.updateData(img.width,img.height,img)
if(_err){err_details=": "+_err
if(tex.is_array&&(_err==="GLError(1282)"||_err==="GLError(1281)")&&engine.webgl2&&!engine.DEBUG){local_storage.setJSON("webgl2_disable",{ua:navigator.userAgent,ts:Date.now()})
console.error('Error loading array texture "'+url+'"'+err_details+", reloading without WebGL2..")
engine.reloadSafe()
return}if(!tex.for_reload){retries=TEX_RETRY_COUNT}}else{exports.load_count=--load_count
return}}var err_url=url&&url.length>200?url.slice(0,200)+"...":url
var err='Error loading texture "'+err_url+'"'+err_details
retries++
if(retries>TEX_RETRY_COUNT){exports.load_count=--load_count
tex.eff_handle=handle_error
tex.load_fail=true
console.error(""+err+(err_details?"":", retries failed"))
if(tex.soft_error){tex.err="Load failed"}else{assert(false,err)}return}console.error(err+", retrying... ")
setTimeout(tryLoad.bind(null,handleLoad),100*retries*retries)}tryLoad(handleLoad)}
Texture.prototype.allocFBO=function(w,h){var fbo_format=settings.fbo_rgba?gl.RGBA:gl.RGB
bindForced(this)
gl.texImage2D(this.target,0,fbo_format,w,h,0,fbo_format,gl.UNSIGNED_BYTE,null)
this.fbo=gl.createFramebuffer()
gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo)
gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.handle,0)
this.last_use=frame_timestamp
this.src_width=this.width=w
this.src_height=this.height=h
this.updateGPUMem()}
Texture.prototype.allocDepth=function(w,h){bindForced(this)
gl.texImage2D(gl.TEXTURE_2D,0,this.format.internal_type,w,h,0,this.format.format,this.format.gl_type,null)
this.last_use=frame_timestamp
this.src_width=this.width=w
this.src_height=this.height=h
this.updateGPUMem()}
Texture.prototype.captureStart=function(w,h){assert(!this.capture)
this.capture={w:w,h:h}
if(this.fbo){gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo)}}
Texture.prototype.captureEnd=function(filter_linear,wrap){assert(this.capture)
var capture=this.capture
this.capture=null
if(this.fbo){gl.bindFramebuffer(gl.FRAMEBUFFER,null)}else{this.copyTexImage(0,0,capture.w,capture.h)}var filter=filter_linear?gl.LINEAR:gl.NEAREST
this.setSamplerState({filter_min:filter,filter_mag:filter,wrap_s:wrap?gl.REPEAT:gl.CLAMP_TO_EDGE,wrap_t:wrap?gl.REPEAT:gl.CLAMP_TO_EDGE})}
Texture.prototype.copyTexImage=function(x,y,w,h){assert(!this.destroyed)
assert(w&&h)
bindHandle(0,this.target,this.handle)
gl.copyTexImage2D(this.target,0,gl.RGB,x,y,w,h,0)
this.last_use=frame_timestamp
this.src_width=this.width=w
this.src_height=this.height=h
this.updateGPUMem()}
Texture.prototype.destroy=function(){if(this.destroyed){return}assert(this.name)
var auto_unload=this.auto_unload
if(auto_unload){this.auto_unload=null
var idx=auto_unload_textures.indexOf(this)
assert(idx!==-1)
ridx(auto_unload_textures,idx)}delete textures[this.name]
unbindAll(this.target)
gl.deleteTexture(this.handle)
if(this.fbo){gl.bindFramebuffer(gl.FRAMEBUFFER,null)
gl.deleteFramebuffer(this.fbo)}this.width=this.height=0
this.updateGPUMem()
this.destroyed=true
if(typeof auto_unload==="function"){auto_unload()}}
function create(params){assert(params.name)
var texture=new Texture(params)
textures[params.name]=texture
return texture}var last_temporary_id=0
function createForCapture(unique_name,auto_unload){var name=unique_name||"screen_temporary_tex_"+ ++last_temporary_id
assert(!textures[name])
var texture=create({filter_min:gl.NEAREST,filter_mag:gl.NEAREST,wrap_s:gl.CLAMP_TO_EDGE,wrap_t:gl.CLAMP_TO_EDGE,format:format.RGB8,name:name,auto_unload:auto_unload})
texture.loaded=true
texture.eff_handle=texture.handle
return texture}function createForDepthCapture(unique_name,tex_format){var name=unique_name||"screen_temporary_tex_"+ ++last_temporary_id
assert(!textures[name])
var texture=create({filter_min:gl.NEAREST,filter_mag:gl.NEAREST,wrap_s:gl.CLAMP_TO_EDGE,wrap_t:gl.CLAMP_TO_EDGE,format:tex_format,name:name})
texture.loaded=true
texture.eff_handle=texture.handle
return texture}function load(params){var key=params.name=params.name||params.url
assert(key)
var tex=textures[key]
if(!tex){tex=create(params)}tex.last_use=frame_timestamp
return tex}function cname(key){var idx=key.lastIndexOf("/")
if(idx!==-1){key=key.slice(idx+1)}idx=key.indexOf(".")
if(idx!==-1){key=key.slice(0,idx)}return key.toLowerCase()}function findTexForReplacement(search_key){search_key=cname(search_key)
for(var key in textures){var compare_key=cname(key)
if(compare_key===search_key){return textures[key]}}return null}var tick_next_tex=0
function texturesTick(){frame_timestamp=engine.frame_timestamp
var len=auto_unload_textures.length
if(!len){return}if(tick_next_tex>=len){tick_next_tex=0}var tex=auto_unload_textures[tick_next_tex]
if(tex.last_use<frame_timestamp-TEX_UNLOAD_TIME){console.log("Unloading texture "+tex.name)
tex.destroy()}else{++tick_next_tex}}function texturesUnloadDynamic(){while(auto_unload_textures.length){auto_unload_textures[0].destroy()}}function textureReload(filename){var tex=textures[filename]
if(tex&&tex.url){tex.for_reload=true
tex.loadURL(tex.url+"?rl="+Date.now())
return true}return false}var depth_supported
function textureSupportsDepth(){return depth_supported}function startup(){default_filter_min=gl.LINEAR_MIPMAP_LINEAR
default_filter_mag=gl.LINEAR
format.R8.internal_type=gl.LUMINANCE
format.R8.gl_type=gl.UNSIGNED_BYTE
format.RGB8.internal_type=gl.RGB
format.RGB8.gl_type=gl.UNSIGNED_BYTE
format.RGBA8.internal_type=gl.RGBA
format.RGBA8.gl_type=gl.UNSIGNED_BYTE
var UNSIGNED_INT_24_8
if(engine.webgl2){depth_supported=true
UNSIGNED_INT_24_8=gl.UNSIGNED_INT_24_8}else{var ext=gl.getExtension("WEBGL_depth_texture")
if(ext){UNSIGNED_INT_24_8=ext.UNSIGNED_INT_24_8_WEBGL
depth_supported=true}}if(depth_supported){format.DEPTH16.internal_type=engine.webgl2?gl.DEPTH_COMPONENT16:gl.DEPTH_COMPONENT
format.DEPTH16.format=gl.DEPTH_COMPONENT
format.DEPTH16.gl_type=gl.UNSIGNED_SHORT
format.DEPTH24.internal_type=engine.webgl2?gl.DEPTH24_STENCIL8:gl.DEPTH_STENCIL
format.DEPTH24.format=gl.DEPTH_STENCIL
format.DEPTH24.gl_type=UNSIGNED_INT_24_8}var ext_anisotropic=gl.getExtension("EXT_texture_filter_anisotropic")||gl.getExtension("MOZ_EXT_texture_filter_anisotropic")||gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic")
if(ext_anisotropic){aniso_enum=ext_anisotropic.TEXTURE_MAX_ANISOTROPY_EXT
aniso=max_aniso=gl.getParameter(ext_anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}handle_error=load({name:"error",width:2,height:2,nozoom:true,format:format.RGBA8,filter_mag:gl.NEAREST,data:new Uint8Array([255,20,147,255,255,0,0,255,255,255,255,255,255,20,147,255])}).handle
handle_loading=load({name:"loading",width:2,height:2,nozoom:true,format:format.RGBA8,data:new Uint8Array([127,127,127,255,0,0,0,255,64,64,64,255,127,127,127,255])}).handle
load({name:"white",width:2,height:2,nozoom:true,format:format.RGBA8,data:new Uint8Array([255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255])})
load({name:"invisible",width:2,height:2,nozoom:true,format:format.RGBA8,data:new Uint8Array([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0])})
filewatchOn(".png",textureReload)}

},{"../common/util.js":89,"./engine.js":20,"./filewatch.js":25,"./local_storage.js":38,"./settings.js":55,"./urlhash.js":71,"assert":undefined}],68:[function(require,module,exports){
"use strict"
exports.REMOVE=exports.IMMEDIATE=exports.CONTINUE=void 0
exports.active=active
exports.fade=fade
exports.pixelate=pixelate
exports.queue=queue
exports.randomTransition=randomTransition
exports.render=render
exports.splitScreen=splitScreen
var assert=require("assert")
var camera2d=require("./camera2d.js")
var glov_engine=require("./engine.js")
var _require=require("./effects.js"),applyCopy=_require.applyCopy,effectsQueue=_require.effectsQueue,effectsIsFinal=_require.effectsIsFinal
var _require2=require("./framebuffer.js"),framebufferCapture=_require2.framebufferCapture,framebufferStart=_require2.framebufferStart,framebufferEnd=_require2.framebufferEnd,temporaryTextureClaim=_require2.temporaryTextureClaim
var floor=Math.floor,min=Math.min,pow=Math.pow,random=Math.random
var sprites=require("./sprites.js")
var shaders=require("./shaders.js")
var textures=require("./textures.js")
var glov_ui=require("./ui.js")
var _require3=require("../common/util.js"),easeOut=_require3.easeOut
var _require4=require("../common/vmath.js"),unit_vec=_require4.unit_vec,vec4=_require4.vec4
var verify=require("../common/verify.js")
var transitions=[]
var IMMEDIATE="immediate"
exports.IMMEDIATE=IMMEDIATE
var REMOVE="remove"
exports.REMOVE=REMOVE
var CONTINUE="continue"
exports.CONTINUE=CONTINUE
var shader_data={transition_pixelate:{fp:"shaders/transition_pixelate.fp"}}
function getShader(key){var elem=shader_data[key]
if(!elem.shader){elem.shader=shaders.create(elem.fp)}return elem.shader}function GlovTransition(z,func){this.z=z
this.capture=null
this.func=func
this.accum_time=0}function transitionCapture(trans){assert(!trans.capture)
trans.capture=textures.createForCapture()
framebufferCapture(trans.capture)}function transitionCaptureFramebuffer(trans){assert(!trans.capture)
trans.capture=framebufferEnd()
temporaryTextureClaim(trans.capture)
if(trans.capture.fbo){applyCopy({source:trans.capture,final:effectsIsFinal()})}else{framebufferStart({width:trans.capture.width,height:trans.capture.height,final:effectsIsFinal()})}}function queue(z,fn){assert(!glov_engine.had_3d_this_frame)
var immediate=false
if(z===IMMEDIATE){immediate=true
z=Z.TRANSITION_FINAL}for(var ii=0;ii<transitions.length;++ii){var _trans=transitions[ii]
if(_trans.z===z){if(!verify(_trans.capture)){return false}}}var trans=new GlovTransition(z,fn)
transitions.push(trans)
if(immediate){transitionCapture(trans)}else{effectsQueue(z+Z.TRANSITION_RANGE,transitionCaptureFramebuffer.bind(null,trans))}return true}function destroyTexture(tex){profilerStart("transition:destroyTexture")
tex.destroy()
profilerStop()}function render(dt){dt=min(dt,100)
for(var trans_idx=0;trans_idx<transitions.length;++trans_idx){var trans=transitions[trans_idx]
trans.accum_time+=dt
assert(trans.capture)
var force_end=trans_idx<transitions.length-1
var ret=trans.func(trans.z,trans.capture,trans.accum_time,force_end)
if(ret===REMOVE){setTimeout(destroyTexture.bind(null,trans.capture),0)
transitions.splice(trans_idx,1)
trans_idx--}}}function active(){return transitions.length}function glovTransitionFadeFunc(fade_time,z,initial,ms_since_start,force_end){var progress=min(ms_since_start/fade_time,1)
var alpha=1-easeOut(progress,2)
var color=vec4(1,1,1,alpha)
camera2d.setNormalized()
sprites.queueraw4([initial],0,0,0,1,1,1,1,0,z,0,1,1,0,color)
if(force_end||progress===1){return REMOVE}return CONTINUE}function glovTransitionSplitScreenFunc(time,border_width,slide_window,z,tex,ms_since_start,force_end){var border_color=vec4(1,1,1,1)
var progress=easeOut(min(ms_since_start/time,1),2)
camera2d.setNormalized()
var uvs=[[0,1],[1,0]]
var xoffs=progress
var v_half=uvs[0][1]+(uvs[1][1]-uvs[0][1])/2
if(slide_window){sprites.queueraw([tex],0,0,z,1-xoffs,1/2,0,uvs[0][1],uvs[1][0]*(1-progress),v_half,unit_vec)
sprites.queueraw([tex],0+xoffs,1/2,z,1-xoffs,1/2,uvs[1][0]*progress,v_half,uvs[1][0],uvs[1][1],unit_vec)}else{sprites.queueraw([tex],0-xoffs,0,z,1,1/2,uvs[0][0],uvs[0][1],uvs[1][0],v_half,unit_vec)
sprites.queueraw([tex],0+xoffs,1/2,z,1,1/2,uvs[0][0],v_half,uvs[1][0],uvs[1][1],unit_vec)}var border_grow_progress=min(progress*4,1)
border_color[3]=border_grow_progress
border_width*=border_grow_progress
glov_ui.drawRect(0,.5-border_width,1-xoffs,.5,z+1,border_color)
glov_ui.drawRect(1-xoffs-border_width,0,1-xoffs,.5,z+1,border_color)
glov_ui.drawRect(xoffs,.5,1,.5+border_width,z+1,border_color)
glov_ui.drawRect(xoffs,.5,xoffs+border_width,1,z+1,border_color)
if(force_end||progress===1){return REMOVE}return CONTINUE}var render_scale=1
var transition_pixelate_textures=[null]
function transitionPixelateCapture(){var tex=framebufferEnd()
framebufferStart({width:tex.width,height:tex.height,final:effectsIsFinal()})
transition_pixelate_textures[0]=tex}function glovTransitionPixelateFunc(time,z,tex,ms_since_start,force_end){var gd_width=glov_engine.width
var progress=min(ms_since_start/time,1)
camera2d.setNormalized()
transition_pixelate_textures[0]=tex
if(progress>.5){effectsQueue(z,transitionPixelateCapture)}var partial_progress=(progress>.5?1-progress:progress)*2
var pixel_scale=pow(2,floor(partial_progress*8.9))/1024*gd_width*render_scale
var param0=vec4(tex.width/pixel_scale,tex.height/pixel_scale,pixel_scale/tex.width,pixel_scale/tex.height)
var param1=vec4(.5/tex.width,.5/tex.height,(tex.texSizeX-1)/tex.width,(tex.texSizeY-1)/tex.height)
sprites.queueraw(transition_pixelate_textures,0,0,z+1,1,1,0,1,1,0,unit_vec,getShader("transition_pixelate"),{param0:param0,param1:param1})
if(force_end||progress===1){return REMOVE}return CONTINUE}function fade(fade_time){return glovTransitionFadeFunc.bind(null,fade_time)}function splitScreen(time,border_width,slide_window){border_width/=camera2d.w()
return glovTransitionSplitScreenFunc.bind(null,time,border_width,slide_window)}function pixelate(fade_time){return glovTransitionPixelateFunc.bind(null,fade_time)}function randomTransition(fade_time_scale){fade_time_scale=fade_time_scale||1
var idx=floor(random()*3)
switch(idx){case 0:return fade(500*fade_time_scale)
case 1:return splitScreen(250*fade_time_scale,2,false)
case 2:return pixelate(750*fade_time_scale)
default:assert(0)}return null}

},{"../common/util.js":89,"../common/verify.js":90,"../common/vmath.js":91,"./camera2d.js":13,"./effects.js":19,"./engine.js":20,"./framebuffer.js":27,"./shaders.js":57,"./sprites.js":65,"./textures.js":67,"./ui.js":69,"assert":undefined}],69:[function(require,module,exports){
"use strict"
exports.Z_MIN_INC=exports.Z=exports.LINE_CAP_SQUARE=exports.LINE_CAP_ROUND=exports.LINE_ALIGN=void 0
exports.addHook=addHook
exports.bindSounds=bindSounds
exports.button=button
exports.buttonBackgroundDraw=buttonBackgroundDraw
exports.buttonImage=buttonImage
exports.buttonShared=buttonShared
exports.buttonSpotBackgroundDraw=buttonSpotBackgroundDraw
exports.buttonText=buttonText
exports.buttonTextDraw=buttonTextDraw
exports.button_width=exports.button_mouseover=exports.button_last_color=exports.button_img_size=exports.button_height=exports.button_focused=exports.button_click=void 0
exports.checkHooks=checkHooks
exports.cleanupDOMElems=cleanupDOMElems
exports.colorSetSetShades=colorSetSetShades
exports.color_panel=exports.color_button=void 0
exports.createEditBox=createEditBox
exports.drawBox=drawBox
exports.drawCircle=drawCircle
exports.drawCone=drawCone
exports.drawElipse=drawElipse
exports.drawHBox=drawHBox
exports.drawHollowCircle=drawHollowCircle
exports.drawHollowRect=drawHollowRect
exports.drawHollowRect2=drawHollowRect2
exports.drawLine=drawLine
exports.drawMultiPartBox=drawMultiPartBox
exports.drawRect=drawRect
exports.drawRect2=drawRect2
exports.drawRect4Color=drawRect4Color
exports.drawTooltip=drawTooltip
exports.drawTooltipBox=drawTooltipBox
exports.drawVBox=drawVBox
exports.endFrame=endFrame
exports.focusCanvas=focusCanvas
exports.font_style_normal=exports.font_style_focused=exports.font_height=exports.font=void 0
exports.getUIElemData=getUIElemData
exports.isMenuUp=isMenuUp
exports.label=label
exports.loadUISprite=loadUISprite
exports.loadUISprite2=loadUISprite2
exports.makeColorSet=makeColorSet
exports.menuUp=menuUp
exports.menu_up=void 0
exports.modalDialog=modalDialog
exports.modalDialogClear=modalDialogClear
exports.modalTextEntry=modalTextEntry
exports.modal_y0=exports.modal_width=exports.modal_title_scale=exports.modal_pad=exports.modal_font_style=exports.modal_button_width=void 0
exports.panel=panel
exports.panel_pixel_scale=void 0
exports.playUISound=playUISound
exports.print=print
exports.progressBar=progressBar
exports.provideUserString=provideUserString
exports.scaleSizes=scaleSizes
exports.setButtonsDefaultLabels=setButtonsDefaultLabels
exports.setFontHeight=setFontHeight
exports.setFonts=setFonts
exports.setModalSizes=setModalSizes
exports.setPanelPixelScale=setPanelPixelScale
exports.setProvideUserStringDefaultMessages=setProvideUserStringDefaultMessages
exports.setTooltipWidth=setTooltipWidth
exports.sprites=void 0
exports.startup=startup
exports.suppressNewDOMElemWarnings=suppressNewDOMElemWarnings
exports.tickUI=tickUI
exports.tooltip_width=exports.tooltip_panel_pixel_scale=exports.tooltip_pad=exports.title_font=void 0
exports.uiGetDOMElem=uiGetDOMElem
exports.uiHandlingNav=uiHandlingNav
exports.ui_sprites_stone=exports.ui_sprites_pixely=void 0
var _SPOT_STATE_TO_UI_BUT
function _extends(){_extends=Object.assign?Object.assign.bind():function(target){for(var i=1;i<arguments.length;i++){var source=arguments[i]
for(var key in source){if(Object.prototype.hasOwnProperty.call(source,key)){target[key]=source[key]}}}return target}
return _extends.apply(this,arguments)}window.Z=window.Z||{}
var Z=window.Z
exports.Z=Z
var Z_MIN_INC=1e-5
exports.Z_MIN_INC=Z_MIN_INC
Z.BORDERS=Z.BORDERS||90
Z.UI=Z.UI||100
Z.MODAL=Z.MODAL||1e3
Z.TOOLTIP=Z.TOOLTIP||2e3
Z.DEBUG=Z.DEBUG||9800
Z.TRANSITION_FINAL=Z.TRANSITION_FINAL||9900
Z.TRANSITION_RANGE=Z.TRANSITION_RANGE||10
Z.FPSMETER=Z.FPSMETER||1e4
var LINE_ALIGN=1<<0
exports.LINE_ALIGN=LINE_ALIGN
var LINE_CAP_SQUARE=1<<1
exports.LINE_CAP_SQUARE=LINE_CAP_SQUARE
var LINE_CAP_ROUND=1<<2
exports.LINE_CAP_ROUND=LINE_CAP_ROUND
var assert=require("assert")
var camera2d=require("./camera2d.js")
var _require=require("./edit_box.js"),editBoxCreate=_require.editBoxCreate,editBoxTick=_require.editBoxTick
var effects=require("./effects.js")
var effectsQueue=effects.effectsQueue
var glov_engine=require("./engine.js")
var glov_font=require("./font.js")
var fontSetDefaultSize=glov_font.fontSetDefaultSize
var glov_input=require("./input.js")
var _require2=require("./link.js"),linkTick=_require2.linkTick
var _require3=require("./localization.js"),getStringFromLocalizable=_require3.getStringFromLocalizable
var abs=Math.abs,floor=Math.floor,max=Math.max,min=Math.min,round=Math.round,sqrt=Math.sqrt
var _require4=require("./scroll_area.js"),scrollAreaSetPixelScale=_require4.scrollAreaSetPixelScale
var _require5=require("./sound.js"),soundLoad=_require5.soundLoad,soundPlay=_require5.soundPlay
var _require6=require("./spot.js"),SPOT_DEFAULT_BUTTON=_require6.SPOT_DEFAULT_BUTTON,SPOT_DEFAULT_BUTTON_DRAW_ONLY=_require6.SPOT_DEFAULT_BUTTON_DRAW_ONLY,SPOT_DEFAULT_LABEL=_require6.SPOT_DEFAULT_LABEL,SPOT_STATE_REGULAR=_require6.SPOT_STATE_REGULAR,SPOT_STATE_DOWN=_require6.SPOT_STATE_DOWN,SPOT_STATE_FOCUSED=_require6.SPOT_STATE_FOCUSED,SPOT_STATE_DISABLED=_require6.SPOT_STATE_DISABLED,spot=_require6.spot,spotEndOfFrame=_require6.spotEndOfFrame,spotFocusableCanvas=_require6.spotFocusableCanvas,spotKey=_require6.spotKey,spotPadMode=_require6.spotPadMode,spotTopOfFrame=_require6.spotTopOfFrame,spotUnfocus=_require6.spotUnfocus
var glov_sprites=require("./sprites.js")
var clipped=glov_sprites.clipped,clipPause=glov_sprites.clipPause,clipResume=glov_sprites.clipResume,BLEND_PREMULALPHA=glov_sprites.BLEND_PREMULALPHA
var textures=require("./textures.js")
var _require7=require("../common/util.js"),clamp=_require7.clamp,clone=_require7.clone,defaults=_require7.defaults,deprecate=_require7.deprecate,lerp=_require7.lerp,merge=_require7.merge
var _require8=require("./mat43.js"),mat43=_require8.mat43,m43identity=_require8.m43identity,m43mul=_require8.m43mul
var _require9=require("../common/vmath.js"),vec2=_require9.vec2,vec4=_require9.vec4,v3scale=_require9.v3scale,unit_vec=_require9.unit_vec
deprecate(exports,"slider_dragging","slider.js:sliderIsDragging()")
deprecate(exports,"slider_rollover","slider.js:sliderIsFocused()")
deprecate(exports,"setSliderDefaultShrink","slider.js:sliderSetDefaultShrink()")
deprecate(exports,"slider","slider.js:slider()")
var MODAL_DARKEN=.75
var KEYS
var PAD
var menu_fade_params_default={blur:[.125,.865],saturation:[.5,.1],brightness:[1,1-MODAL_DARKEN],fallback_darken:vec4(0,0,0,MODAL_DARKEN),z:Z.MODAL}
var color_set_shades=vec4(1,1,1,1)
var color_sets=[]
function applyColorSet(color_set){v3scale(color_set.regular,color_set.color,color_set_shades[0])
v3scale(color_set.rollover,color_set.color,color_set_shades[1])
v3scale(color_set.down,color_set.color,color_set_shades[2])
v3scale(color_set.disabled,color_set.color,color_set_shades[3])}function makeColorSet(color){var ret={color:color,regular:vec4(),rollover:vec4(),down:vec4(),disabled:vec4()}
for(var field in ret){ret[field][3]=color[3]}color_sets.push(ret)
applyColorSet(ret)
return ret}var hooks=[]
function addHook(draw,click){hooks.push({draw:draw,click:click})}var ui_elem_data={}
function getUIElemData(type,param,allocator){var key=spotKey(param)
var by_type=ui_elem_data[type]
if(!by_type){by_type=ui_elem_data[type]={}}var elem_data=by_type[key]
if(!elem_data){elem_data=by_type[key]=allocator?allocator(param):{}}elem_data.frame_index=glov_engine.frame_index
return elem_data}function doBlurEffect(factor){effects.applyGaussianBlur({blur:factor})}var desaturate_xform=mat43()
var desaturate_tmp=mat43()
function doDesaturateEffect(saturation,brightness){m43identity(desaturate_xform)
effects.saturationMatrix(desaturate_tmp,saturation)
m43mul(desaturate_xform,desaturate_xform,desaturate_tmp)
effects.brightnessScaleMatrix(desaturate_tmp,brightness)
m43mul(desaturate_xform,desaturate_xform,desaturate_tmp)
effects.applyColorMatrix({colorMatrix:desaturate_xform})}var button_height=32
exports.button_height=button_height
var font_height=24
exports.font_height=font_height
var button_width=200
exports.button_width=button_width
var modal_button_width=100
exports.modal_button_width=modal_button_width
var button_img_size=button_height
exports.button_img_size=button_img_size
var modal_width=600
exports.modal_width=modal_width
var modal_y0=200
exports.modal_y0=modal_y0
var modal_title_scale=1.2
exports.modal_title_scale=modal_title_scale
var modal_pad=16
exports.modal_pad=modal_pad
var panel_pixel_scale=32/13
exports.panel_pixel_scale=panel_pixel_scale
var tooltip_panel_pixel_scale=panel_pixel_scale
exports.tooltip_panel_pixel_scale=tooltip_panel_pixel_scale
var tooltip_width=400
exports.tooltip_width=tooltip_width
var tooltip_pad=8
exports.tooltip_pad=tooltip_pad
var font_style_normal=glov_font.styleColored(null,255)
exports.font_style_normal=font_style_normal
var font_style_focused=glov_font.style(font_style_normal,{})
exports.font_style_focused=font_style_focused
var font
exports.font=font
var title_font
exports.title_font=title_font
var sprites={}
exports.sprites=sprites
var color_button=makeColorSet([1,1,1,1])
exports.color_button=color_button
var color_panel=vec4(1,1,.75,1)
exports.color_panel=color_panel
var modal_font_style=glov_font.styleColored(null,255)
exports.modal_font_style=modal_font_style
var sounds={}
var button_mouseover=false
exports.button_mouseover=button_mouseover
var button_focused=false
exports.button_focused=button_focused
var button_click=null
exports.button_click=button_click
var modal_dialog=null
var menu_up=false
exports.menu_up=menu_up
var menu_fade_params=merge({},menu_fade_params_default)
var menu_up_time=0
var dom_elems=[]
var dom_elems_issued=0
var button_keys
var default_line_mode
var buttons_default_labels={ok:"OK",cancel:"Cancel",yes:"Yes",no:"No"}
var default_copy_success_msg="Text copied to clipboard!"
var default_copy_failure_msg="Copy to clipboard FAILED, please copy from below."
function colorSetSetShades(rollover,down,disabled){color_set_shades[1]=rollover
color_set_shades[2]=down
color_set_shades[3]=disabled
for(var ii=0;ii<color_sets.length;++ii){applyColorSet(color_sets[ii])}}function loadUISprite(name,ws,hs){var wrap_s=gl.CLAMP_TO_EDGE
var wrap_t=gl.CLAMP_TO_EDGE
sprites[name]=glov_sprites.create({name:"ui/"+name,ws:ws,hs:hs,wrap_s:wrap_s,wrap_t:wrap_t})}function loadUISprite2(name,param){if(param===null){return}var wrap_s=gl.CLAMP_TO_EDGE
var wrap_t=param.wrap_t?gl.REPEAT:gl.CLAMP_TO_EDGE
var sprite_param={ws:param.ws,hs:param.hs,wrap_s:wrap_s,wrap_t:wrap_t,layers:param.layers}
if(param.url){sprite_param.url=param.url}else{sprite_param.name="ui/"+(param.name||name)}sprites[name]=glov_sprites.create(sprite_param)}function setFonts(new_font,new_title_font){exports.font=font=new_font
exports.title_font=title_font=new_title_font||font}function setButtonsDefaultLabels(buttons_labels){for(var key in buttons_labels){buttons_default_labels[key.toLowerCase()]=buttons_labels[key]}}function setProvideUserStringDefaultMessages(success_msg,failure_msg){default_copy_success_msg=success_msg
default_copy_failure_msg=failure_msg}var base_ui_sprites={color_set_shades:[1,1,1],white:{url:"white"},button:{ws:[8,112,8],hs:[128]},button_rollover:{ws:[8,112,8],hs:[128]},button_down:{ws:[8,112,8],hs:[128]},button_disabled:{ws:[8,112,8],hs:[128]},panel:{ws:[32,64,32],hs:[32,64,32]},menu_entry:{ws:[8,112,8],hs:[128]},menu_selected:{ws:[8,112,8],hs:[128]},menu_down:{ws:[8,112,8],hs:[128]},menu_header:{ws:[8,112,136],hs:[128]},slider:{ws:[56,16,56],hs:[128]},slider_handle:{ws:[64],hs:[128]},scrollbar_bottom:{ws:[64],hs:[64]},scrollbar_trough:{ws:[64],hs:[8],wrap_t:true},scrollbar_top:{ws:[64],hs:[64]},scrollbar_handle_grabber:{ws:[64],hs:[64]},scrollbar_handle:{ws:[64],hs:[24,16,24]},progress_bar:{ws:[48,32,48],hs:[128]},progress_bar_trough:{ws:[48,32,48],hs:[128]}}
var ui_sprites_stone={button:{name:"stone/button",ws:[32,64,32],hs:[128]},button_rollover:{name:"stone/button_rollover",ws:[32,64,32],hs:[128]},button_down:{name:"stone/button_down",ws:[32,64,32],hs:[128]},button_disabled:{name:"stone/button_disabled",ws:[32,64,32],hs:[128]}}
exports.ui_sprites_stone=ui_sprites_stone
var ui_sprites_pixely={color_set_shades:[.8,.7,.4],button:{name:"pixely/button",ws:[4,5,4],hs:[13]},button_rollover:null,button_down:{name:"pixely/button_down",ws:[4,5,4],hs:[13]},button_disabled:{name:"pixely/button_disabled",ws:[4,5,4],hs:[13]},panel:{name:"pixely/panel",ws:[3,2,3],hs:[3,10,3]},menu_entry:{name:"pixely/menu_entry",ws:[4,5,4],hs:[13]},menu_selected:{name:"pixely/menu_selected",ws:[4,5,4],hs:[13]},menu_down:{name:"pixely/menu_down",ws:[4,5,4],hs:[13]},menu_header:{name:"pixely/menu_header",ws:[4,5,12],hs:[13]},slider:{name:"pixely/slider",ws:[6,2,6],hs:[13]},slider_handle:{name:"pixely/slider_handle",ws:[9],hs:[13]},scrollbar_bottom:{name:"pixely/scrollbar_bottom",ws:[11],hs:[13]},scrollbar_trough:{name:"pixely/scrollbar_trough",ws:[11],hs:[8],wrap_t:true},scrollbar_top:{name:"pixely/scrollbar_top",ws:[11],hs:[13]},scrollbar_handle_grabber:{name:"pixely/scrollbar_handle_grabber",ws:[11],hs:[13]},scrollbar_handle:{name:"pixely/scrollbar_handle",ws:[11],hs:[3,7,3]},progress_bar:{name:"pixely/progress_bar",ws:[3,7,3],hs:[13]},progress_bar_trough:{name:"pixely/progress_bar_trough",ws:[3,7,3],hs:[13]}}
exports.ui_sprites_pixely=ui_sprites_pixely
function startup(param){exports.font=font=param.font
exports.title_font=title_font=param.title_font||font
var overrides=param.ui_sprites
KEYS=glov_input.KEYS
PAD=glov_input.PAD
var ui_sprites=_extends({},base_ui_sprites,param.ui_sprites)
for(var key in ui_sprites){var base_elem=base_ui_sprites[key]
if(typeof base_elem==="object"&&!Array.isArray(base_elem)){var override=overrides&&overrides[key]
loadUISprite2(key,override===undefined?base_elem:override)}}sprites.button_regular=sprites.button
if(ui_sprites.color_set_shades){colorSetSetShades.apply(void 0,ui_sprites.color_set_shades)}if(sprites.button_rollover&&color_set_shades[1]!==1){colorSetSetShades(1,color_set_shades[2],color_set_shades[3])}if(sprites.button_down&&color_set_shades[2]!==1){colorSetSetShades(color_set_shades[1],1,color_set_shades[3])}if(sprites.button_disabled&&color_set_shades[3]!==1){colorSetSetShades(color_set_shades[1],color_set_shades[2],1)}button_keys={ok:{key:[KEYS.O],pad:[PAD.X],low_key:[KEYS.ESC]},cancel:{key:[KEYS.ESC],pad:[PAD.B,PAD.Y]}}
button_keys.yes=clone(button_keys.ok)
button_keys.yes.key.push(KEYS.Y)
button_keys.no=clone(button_keys.cancel)
button_keys.no.key.push(KEYS.N)
if(param.line_mode!==undefined){default_line_mode=param.line_mode}else{default_line_mode=LINE_ALIGN|LINE_CAP_ROUND}scaleSizes(1)}var dynamic_text_elem
var per_frame_dom_alloc=[0,0,0,0,0,0,0]
var per_frame_dom_suppress=0
function suppressNewDOMElemWarnings(){per_frame_dom_suppress=glov_engine.frame_index+1}function uiGetDOMElem(last_elem,allow_modal){if(modal_dialog&&!allow_modal){return null}if(dom_elems_issued>=dom_elems.length||!last_elem){var _elem=document.createElement("div")
if(glov_engine.DEBUG&&!glov_engine.resizing()&&glov_engine.frame_index>per_frame_dom_suppress){per_frame_dom_alloc[glov_engine.frame_index%per_frame_dom_alloc.length]=1
var sum=0
for(var ii=0;ii<per_frame_dom_alloc.length;++ii){sum+=per_frame_dom_alloc[ii]}assert(sum<per_frame_dom_alloc.length,"Allocated new DOM elements for too many consecutive frames")}_elem.setAttribute("class","glovui_dynamic")
if(!dynamic_text_elem){dynamic_text_elem=document.getElementById("dynamic_text")}dynamic_text_elem.appendChild(_elem)
dom_elems.push(_elem)
last_elem=_elem}if(dom_elems[dom_elems_issued]!==last_elem){for(var _ii=dom_elems_issued+1;_ii<dom_elems.length;++_ii){if(dom_elems[_ii]===last_elem){dom_elems[_ii]=dom_elems[dom_elems_issued]
dom_elems[dom_elems_issued]=last_elem}}}var elem=dom_elems[dom_elems_issued]
dom_elems_issued++
return elem}function bindSounds(_sounds){sounds=_sounds
for(var key in sounds){soundLoad(sounds[key])}}function drawHBox(coords,s,color){var uidata=s.uidata
var x=coords.x
var ws=[uidata.wh[0]*coords.h,0,uidata.wh[2]*coords.h]
if(coords.no_min_width&&ws[0]+ws[2]>coords.w){var scale=coords.w/(ws[0]+ws[2])
ws[0]*=scale
ws[2]*=scale}else{ws[1]=max(0,coords.w-ws[0]-ws[2])}for(var ii=0;ii<ws.length;++ii){var my_w=ws[ii]
if(my_w){var draw_param={x:x,y:coords.y,z:coords.z||Z.UI,color:color,w:my_w,h:coords.h,uvs:uidata.rects[ii],nozoom:true}
if(coords.color1){draw_param.color1=coords.color1
s.drawDualTint(draw_param)}else{s.draw(draw_param)}}x+=my_w}}function drawVBox(coords,s,color){var uidata=s.uidata
var hs=[uidata.hw[0]*coords.w,0,uidata.hw[2]*coords.w]
var y=coords.y
hs[1]=max(0,coords.h-hs[0]-hs[2])
for(var ii=0;ii<hs.length;++ii){var my_h=hs[ii]
s.draw({x:coords.x,y:y,z:coords.z,color:color,w:coords.w,h:my_h,uvs:uidata.rects[ii],nozoom:true})
y+=my_h}}function drawBox(coords,s,pixel_scale,color){var uidata=s.uidata
var scale=pixel_scale
var ws=[uidata.widths[0]*scale,0,uidata.widths[2]*scale]
ws[1]=max(0,coords.w-ws[0]-ws[2])
var hs=[uidata.heights[0]*scale,0,uidata.heights[2]*scale]
hs[1]=max(0,coords.h-hs[0]-hs[2])
var x=coords.x
for(var ii=0;ii<ws.length;++ii){var my_w=ws[ii]
if(my_w){var y=coords.y
for(var jj=0;jj<hs.length;++jj){var my_h=hs[jj]
if(my_h){s.draw({x:x,y:y,z:coords.z,color:color,w:my_w,h:my_h,uvs:uidata.rects[jj*3+ii],nozoom:true})
y+=my_h}}x+=my_w}}}function drawMultiPartBox(coords,scaleable_data,s,pixel_scale,color){var uidata=s.uidata
var scale=pixel_scale
var ws=[]
var fixed_w_sum=0
var scaleable_sum=0
for(var i=0;i<uidata.widths.length;i++){if(scaleable_data.widths[i]<0){ws.push(uidata.widths[i]*scale)
fixed_w_sum+=uidata.widths[i]*scale}else{ws.push(0)
scaleable_sum+=scaleable_data.widths[i]}}assert(scaleable_sum===1)
for(var _i=0;_i<uidata.widths.length;_i++){if(scaleable_data.widths[_i]>=0){ws[_i]=max(0,(coords.w-fixed_w_sum)*scaleable_data.widths[_i])}}scaleable_sum=0
var hs=[]
var fixed_h_sum=0
for(var _i2=0;_i2<uidata.heights.length;_i2++){if(scaleable_data.heights[_i2]<0){hs.push(uidata.heights[_i2]*scale)
fixed_h_sum+=uidata.heights[_i2]*scale}else{hs.push(0)
scaleable_sum+=scaleable_data.heights[_i2]}}assert(scaleable_sum===1)
for(var _i3=0;_i3<uidata.heights.length;_i3++){if(scaleable_data.heights[_i3]>=0){hs[_i3]=max(0,(coords.h-fixed_h_sum)*scaleable_data.heights[_i3])}}var x=coords.x
for(var ii=0;ii<ws.length;++ii){var my_w=ws[ii]
if(my_w){var y=coords.y
for(var jj=0;jj<hs.length;++jj){var my_h=hs[jj]
if(my_h){s.draw({x:x,y:y,z:coords.z,color:color,w:my_w,h:my_h,uvs:uidata.rects[jj*ws.length+ii],nozoom:true})
y+=my_h}}x+=my_w}}}function playUISound(name,volume){if(name==="select"){name="button_click"}if(sounds[name]){soundPlay(sounds[name],volume)}}function focusCanvas(){spotUnfocus()}function uiHandlingNav(){return menu_up||!spotFocusableCanvas().focused}function panel(param){assert(typeof param.x==="number")
assert(typeof param.y==="number")
assert(typeof param.w==="number")
assert(typeof param.h==="number")
param.z=param.z||Z.UI-1
param.eat_clicks=param.eat_clicks===undefined?true:param.eat_clicks
var color=param.color||color_panel
drawBox(param,param.sprite||sprites.panel,param.pixel_scale||panel_pixel_scale,color)
if(param.eat_clicks){glov_input.mouseOver(param)}}function drawTooltip(param){param.tooltip=getStringFromLocalizable(param.tooltip)
assert(typeof param.x==="number")
assert(typeof param.y==="number")
assert(typeof param.tooltip==="string")
var clip_pause=clipped()
if(clip_pause){clipPause()}var tooltip_w=param.tooltip_width||tooltip_width
var z=param.z||Z.TOOLTIP
var tooltip_y0=param.y
var eff_tooltip_pad=param.tooltip_pad||tooltip_pad
var w=tooltip_w-eff_tooltip_pad*2
var dims=font.dims(modal_font_style,w,0,font_height,param.tooltip)
var above=param.tooltip_above
if(!above&&param.tooltip_auto_above_offset){above=tooltip_y0+dims.h+eff_tooltip_pad*2>camera2d.y1()}var x=param.x
var eff_tooltip_w=dims.w+eff_tooltip_pad*2
if(x+eff_tooltip_w>camera2d.x1()){x=camera2d.x1()-eff_tooltip_w}if(above){tooltip_y0-=dims.h+eff_tooltip_pad*2+(param.tooltip_auto_above_offset||0)}var y=tooltip_y0+eff_tooltip_pad
y+=font.drawSizedWrapped(modal_font_style,x+eff_tooltip_pad,y,z+1,w,0,font_height,param.tooltip)
y+=eff_tooltip_pad
var pixel_scale=param.pixel_scale||tooltip_panel_pixel_scale
panel({x:x,y:tooltip_y0,z:z,w:eff_tooltip_w,h:y-tooltip_y0,pixel_scale:pixel_scale,eat_clicks:false})
if(clip_pause){clipResume()}}function checkHooks(param,click){if(param.hook){for(var ii=0;ii<hooks.length;++ii){if(click){hooks[ii].click(param)}hooks[ii].draw(param)}}}function drawTooltipBox(param){drawTooltip({x:param.x,y:param.y+param.h+2,tooltip_auto_above_offset:param.h+4,tooltip_above:param.tooltip_above,tooltip:param.tooltip,tooltip_width:param.tooltip_width})}function progressBar(param){drawHBox(param,sprites.progress_bar_trough,param.color_trough||param.color||unit_vec)
var progress=clamp(param.progress,0,1)
drawHBox({x:param.x+(param.centered?param.w*(1-progress)*.5:0),y:param.y,z:(param.z||Z.UI)+Z_MIN_INC,w:param.w*progress,h:param.h,no_min_width:true},sprites.progress_bar,param.color||unit_vec)
if(param.tooltip){spot({x:param.x,y:param.y,w:param.w,h:param.h,tooltip:param.tooltip,def:SPOT_DEFAULT_LABEL})}}var SPOT_STATE_TO_UI_BUTTON_STATE=(_SPOT_STATE_TO_UI_BUT={},_SPOT_STATE_TO_UI_BUT[SPOT_STATE_REGULAR]="regular",_SPOT_STATE_TO_UI_BUT[SPOT_STATE_DOWN]="down",_SPOT_STATE_TO_UI_BUT[SPOT_STATE_FOCUSED]="rollover",_SPOT_STATE_TO_UI_BUT[SPOT_STATE_DISABLED]="disabled",_SPOT_STATE_TO_UI_BUT)
var UISPOT_BUTTON_DISABLED=_extends({},SPOT_DEFAULT_BUTTON,{disabled:true,disabled_focusable:false,sound_rollover:null})
function buttonShared(param){profilerStart("buttonShared")
param.z=param.z||Z.UI
if(param.rollover_quiet){param.sound_rollover=null}var spot_ret
if(param.draw_only&&!param.draw_only_mouseover){spot_ret={ret:false,state:"regular",focused:false}}else{if(param.draw_only){assert(!param.def||param.def===SPOT_DEFAULT_BUTTON_DRAW_ONLY)
param.def=SPOT_DEFAULT_BUTTON_DRAW_ONLY}else if(param.disabled&&!param.disabled_focusable){param.def=param.def||UISPOT_BUTTON_DISABLED}else{param.def=param.def||SPOT_DEFAULT_BUTTON}if(param.sound){param.sound_button=param.sound}spot_ret=spot(param)
spot_ret.state=SPOT_STATE_TO_UI_BUTTON_STATE[spot_ret.spot_state]
if(spot_ret.ret){exports.button_click=button_click=spot_ret
button_click.was_double_click=spot_ret.double_click}}exports.button_focused=button_focused=exports.button_mouseover=button_mouseover=spot_ret.focused
param.z+=param.z_bias&&param.z_bias[spot_ret.state]||0
profilerStop("buttonShared")
return spot_ret}var button_last_color
exports.button_last_color=button_last_color
function buttonBackgroundDraw(param,state){profilerStart("buttonBackgroundDraw")
var colors=param.colors||color_button
var color=exports.button_last_color=button_last_color=param.color||colors[state]
if(!param.no_bg){var base_name=param.base_name||"button"
var sprite_name=base_name+"_"+state
var sprite=sprites[sprite_name]
if(!sprite){sprite=sprites[base_name]}drawHBox(param,sprite,color)}profilerStop("buttonBackgroundDraw")}function buttonSpotBackgroundDraw(param,spot_state){profilerStart("buttonSpotBackgroundDraw")
var state=SPOT_STATE_TO_UI_BUTTON_STATE[spot_state]
var colors=param.colors||color_button
var color=exports.button_last_color=button_last_color=param.color||colors[state]
if(!param.no_bg){var base_name=param.base_name||"button"
var sprite_name=base_name+"_"+state
var sprite=sprites[sprite_name]
if(!sprite){sprite=sprites[base_name]}drawHBox(param,sprite,color)}profilerStop("buttonSpotBackgroundDraw")}function buttonTextDraw(param,state,focused){profilerStart("buttonTextDraw")
buttonBackgroundDraw(param,state)
var hpad=min(param.font_height*.25,param.w*.1)
font.drawSizedAligned(focused?font_style_focused:font_style_normal,param.x+hpad,param.y,param.z+.1,param.font_height,param.align||glov_font.ALIGN.HVCENTERFIT,param.w-hpad*2,param.h,param.text)
profilerStop("buttonTextDraw")}function buttonText(param){profilerStart("buttonText")
param.text=getStringFromLocalizable(param.text)
assert(typeof param.x==="number")
assert(typeof param.y==="number")
assert(typeof param.text==="string")
param.w=param.w||button_width
param.h=param.h||button_height
param.font_height=param.font_height||font_height
var spot_ret=buttonShared(param)
var ret=spot_ret.ret,state=spot_ret.state,focused=spot_ret.focused
buttonTextDraw(param,state,focused)
profilerStop("buttonText")
return ret?spot_ret:null}function buttonImageDraw(param,state,focused){profilerStart("buttonImageDraw")
var uvs=param.img_rect
var img=param.imgs&&param.imgs[state]||param.img
if(typeof param.frame==="number"){uvs=img.uidata.rects[param.frame]}buttonBackgroundDraw(param,state)
var color=button_last_color
var img_origin=img.origin
var img_w=img.size[0]
var img_h=img.size[1]
var aspect=img_w/img_h
if(typeof param.frame==="number"){aspect=img.uidata.aspect?img.uidata.aspect[param.frame]:1}var largest_w_horiz=param.w*param.shrink
var largest_w_vert=param.h*param.shrink*aspect
img_w=min(largest_w_horiz,largest_w_vert)
img_h=img_w/aspect
var pad_top=(param.h-img_h)/2
var draw_param={x:param.x+(param.left_align?pad_top:(param.w-img_w)/2)+img_origin[0]*img_w,y:param.y+pad_top+img_origin[1]*img_h,z:param.z+Z_MIN_INC,color:param.img_color||param.color1&&param.color||color,color1:param.color1,w:img_w/img.size[0],h:img_h/img.size[1],uvs:uvs,rot:param.rotation}
if(param.flip){var x=draw_param.x,w=draw_param.w
draw_param.x=x+w
draw_param.w=-w}if(param.color1){img.drawDualTint(draw_param)}else{img.draw(draw_param)}profilerStop("buttonImageDraw")}function buttonImage(param){profilerStart("buttonImage")
assert(typeof param.x==="number")
assert(typeof param.y==="number")
assert(param.imgs||param.img&&param.img.draw)
param.z=param.z||Z.UI
param.w=param.w||button_img_size
param.h=param.h||param.w||button_img_size
param.shrink=param.shrink||.75
var spot_ret=buttonShared(param)
var ret=spot_ret.ret,state=spot_ret.state,focused=spot_ret.focused
buttonImageDraw(param,state,focused)
profilerStop("buttonImage")
return ret?spot_ret:null}function button(param){if(param.img&&!param.text){return buttonImage(param)}else if(param.text&&!param.img){return buttonText(param)}profilerStart("button")
assert(typeof param.x==="number")
assert(typeof param.y==="number")
assert(param.img&&param.img.draw)
param.z=param.z||Z.UI
param.h=param.h||button_img_size
param.w=param.w||button_width
param.shrink=param.shrink||.75
param.left_align=true
param.font_height=param.font_height||font_height
var spot_ret=buttonShared(param)
var ret=spot_ret.ret,state=spot_ret.state,focused=spot_ret.focused
buttonImageDraw(param,state,focused)
var saved_no_bg=param.no_bg
var saved_w=param.w
var saved_x=param.x
param.no_bg=true
param.x+=param.h*param.shrink
param.w-=param.h*param.shrink
buttonTextDraw(param,state,focused)
param.no_bg=saved_no_bg
param.w=saved_w
param.x=saved_x
profilerStop("button")
return ret?spot_ret:null}function print(style,x,y,z,text){return font.drawSized(style,x,y,z,font_height,text)}function label(param){profilerStart("label")
var style=param.style,x=param.x,y=param.y,align=param.align,w=param.w,h=param.h,text=param.text,tooltip=param.tooltip
text=getStringFromLocalizable(text)
var use_font=param.font||font
var z=param.z||Z.UI
var size=param.size||font_height
assert(isFinite(x))
assert(isFinite(y))
assert.equal(typeof text,"string")
if(tooltip){if(!w){w=use_font.getStringWidth(style,size,text)}assert(isFinite(w))
assert(isFinite(h))
var spot_ret=spot({x:x,y:y,w:w,h:h,tooltip:tooltip,def:SPOT_DEFAULT_LABEL})
if(spot_ret.focused&&spotPadMode()){if(param.style_focused){style=param.style_focused}else{drawElipse(x-w*.25,y-h*.25,x+w*1.25,y+h*1.25,z-.001,.5,unit_vec)}}}if(text){if(align){use_font.drawSizedAligned(style,x,y,z,size,align,w,h,text)}else{use_font.drawSized(style,x,y,z,size,text)}}profilerStop("label")}function modalDialog(param){param.title=getStringFromLocalizable(param.title)
param.text=""+(getStringFromLocalizable(param.text)||"")
assert(!param.title||typeof param.title==="string")
assert(!param.text||typeof param.text==="string")
assert(!param.buttons||typeof param.buttons==="object")
if(param.buttons){for(var key in param.buttons){if(typeof param.buttons[key]!=="object"){param.buttons[key]={cb:param.buttons[key]}}}}modal_dialog=param}function modalDialogClear(){modal_dialog=null}var dom_requirement=vec2(24,24)
var virtual_size=vec2()
function modalDialogRun(){camera2d.domDeltaToVirtual(virtual_size,dom_requirement)
var fullscreen_mode=false
var eff_font_height=modal_dialog.font_height||font_height
var eff_button_height=button_height
var pad=modal_pad
var vpad=modal_pad*.5
var general_scale=1
var exit_lock=true
var num_lines
if(virtual_size[0]>.05*camera2d.h()&&camera2d.w()>camera2d.h()*2){fullscreen_mode=true
eff_button_height=eff_font_height
vpad=pad=4
var old_h=camera2d.h()
camera2d.push()
for(num_lines=1;;num_lines++){camera2d.setAspectFixed2(1,eff_font_height*(modal_title_scale+1+num_lines)+pad*4.5)
general_scale=camera2d.h()/old_h
if(!modal_dialog.text){break}var _game_width=camera2d.x1()-camera2d.x0()
var _text_w=_game_width-pad*2
var wrapped_numlines=font.numLines(modal_font_style,_text_w,0,eff_font_height,modal_dialog.text)
if(wrapped_numlines<=num_lines){break}}}var _modal_dialog=modal_dialog,buttons=_modal_dialog.buttons,click_anywhere=_modal_dialog.click_anywhere
var keys=Object.keys(buttons||{})
var game_width=camera2d.x1()-camera2d.x0()
var eff_modal_width=fullscreen_mode?game_width:modal_dialog.width||modal_width
var eff_button_width=modal_dialog.button_width||modal_button_width
var max_total_button_width=eff_modal_width*2/3
eff_button_width=min(eff_button_width,max_total_button_width/keys.length)
var text_w=eff_modal_width-pad*2
var x0=camera2d.x0()+round((game_width-eff_modal_width)/2)
var x=x0+pad
var y0=fullscreen_mode?0:modal_dialog.y0||modal_y0
var y=round(y0+pad)
if(modal_dialog.title){if(fullscreen_mode){title_font.drawSizedAligned(modal_font_style,x,y,Z.MODAL,eff_font_height*modal_title_scale,glov_font.ALIGN.HFIT,text_w,0,modal_dialog.title)
y+=eff_font_height*modal_title_scale}else{y+=title_font.drawSizedWrapped(modal_font_style,x,y,Z.MODAL,text_w,0,eff_font_height*modal_title_scale,modal_dialog.title)}y=round(y+vpad*1.5)}if(modal_dialog.text||fullscreen_mode){if(fullscreen_mode){if(modal_dialog.text){font.drawSizedAligned(modal_font_style,x,y,Z.MODAL,eff_font_height,glov_font.ALIGN.HWRAP,text_w,0,modal_dialog.text)}y+=eff_font_height*num_lines}else{y+=font.drawSizedWrapped(modal_font_style,x,y,Z.MODAL,text_w,0,eff_font_height,modal_dialog.text)}y=round(y+vpad)}var tick_key
if(modal_dialog.tick){var avail_width=eff_modal_width-pad*2
if(fullscreen_mode){avail_width-=(pad+eff_button_width)*keys.length}var param={x:x,y:y,modal_width:eff_modal_width,avail_width:avail_width,font_height:eff_font_height,fullscreen_mode:fullscreen_mode}
tick_key=modal_dialog.tick(param)
y=param.y}x=x0+eff_modal_width-(pad+eff_button_width)*keys.length
var did_button=-1
for(var ii=0;ii<keys.length;++ii){var key=keys[ii]
var key_lower=key.toLowerCase()
var cur_button=buttons[key]=buttons[key]||{}
var eff_button_keys=button_keys[key_lower]
var pressed=0
if(eff_button_keys){for(var jj=0;jj<eff_button_keys.key.length;++jj){pressed+=glov_input.keyDownEdge(eff_button_keys.key[jj],cur_button.in_event_cb)
if(eff_button_keys.key[jj]===tick_key){pressed++}}for(var _jj=0;_jj<eff_button_keys.pad.length;++_jj){pressed+=glov_input.padButtonDownEdge(eff_button_keys.pad[_jj])}}if(click_anywhere&&ii===0&&glov_input.click()){++pressed}if(pressed){did_button=ii}var but_label=cur_button.label||buttons_default_labels[key_lower]||key
if(buttonText(defaults({x:x,y:y,z:Z.MODAL,w:eff_button_width,h:eff_button_height,text:but_label,auto_focus:ii===0},cur_button))){did_button=ii}x=round(x+pad+eff_button_width)}if(did_button===-1){for(var _ii2=0;_ii2<keys.length;++_ii2){var _key=keys[_ii2]
var _eff_button_keys=button_keys[_key.toLowerCase()]
if(_eff_button_keys&&_eff_button_keys.low_key){for(var _jj2=0;_jj2<_eff_button_keys.low_key.length;++_jj2){if(glov_input.keyDownEdge(_eff_button_keys.low_key[_jj2],buttons[_key].in_event_cb)||_eff_button_keys.low_key[_jj2]===tick_key){did_button=_ii2}}}}}if(did_button!==-1){var _key2=keys[did_button]
playUISound("button_click")
modal_dialog=null
if(buttons[_key2].cb){buttons[_key2].cb()}exit_lock=false}y+=eff_button_height
y=round(y+vpad+pad)
panel({x:x0,y:y0,z:Z.MODAL-1,w:eff_modal_width,h:(fullscreen_mode?camera2d.y1():y)-y0,pixel_scale:panel_pixel_scale*general_scale})
if(glov_input.pointerLocked()&&exit_lock){glov_input.pointerLockExit()}glov_input.eatAllInput()
if(fullscreen_mode){camera2d.pop()}}function modalTextEntry(param){var eb=editBoxCreate({initial_focus:true,spellcheck:false,initial_select:true,text:param.edit_text,max_len:param.max_len,esc_clears:false})
var buttons={}
for(var key in param.buttons){var cb=param.buttons[key]
if(cb!==null&&typeof cb==="object"&&"cb"in cb){cb=param.buttons[key].cb}if(typeof cb==="function"){cb=function(old_fn){return function(){old_fn(eb.getText())}}(cb)}buttons[key]=defaults({cb:cb},param.buttons[key])}param.buttons=buttons
param.text=""+(param.text||"")
var old_tick=param.tick
param.tick=function(params){var eb_ret=eb.run({x:params.x,y:params.y,w:params.avail_width||param.edit_w,font_height:params.font_height})
if(!params.fullscreen_mode){params.y+=params.font_height+modal_pad}var ret
if(eb_ret===eb.SUBMIT){ret=KEYS.O}else if(eb_ret===eb.CANCEL){ret=KEYS.ESC}if(old_tick){ret=old_tick(params)||ret}return ret}
modalDialog(param)}function createEditBox(param){return editBoxCreate(param)}var pp_bad_frames=0
function isMenuUp(){return modal_dialog||menu_up}function releaseOldUIElemData(){for(var type in ui_elem_data){var by_type=ui_elem_data[type]
var any=false
for(var key in by_type){var elem_data=by_type[key]
if(elem_data.frame_index<glov_engine.frame_index-1){delete by_type[key]}else{any=true}}if(!any){delete ui_elem_data[type]}}}function tickUI(dt){per_frame_dom_alloc[glov_engine.frame_index%per_frame_dom_alloc.length]=0
releaseOldUIElemData()
editBoxTick()
linkTick()
dom_elems_issued=0
var pp_this_frame=false
if(modal_dialog||menu_up){var params=menu_fade_params
if(!menu_up){params=menu_fade_params_default}menu_up_time+=dt
var factor=min(menu_up_time/500,1)
if(glov_engine.postprocessing&&!glov_engine.defines.NOPP){var blur_factor=lerp(factor,params.blur[0],params.blur[1])
if(blur_factor){effectsQueue(params.z-2,doBlurEffect.bind(null,blur_factor))}var saturation=lerp(factor,params.saturation[0],params.saturation[1])
var brightness=lerp(factor,params.brightness[0],params.brightness[1])
if(saturation!==1||brightness!==1){effectsQueue(params.z-1,doDesaturateEffect.bind(null,saturation,brightness))}pp_this_frame=true}else{sprites.white.draw({x:camera2d.x0Real(),y:camera2d.y0Real(),z:params.z-2,color:params.fallback_darken,w:camera2d.wReal(),h:camera2d.hReal()})}}else{menu_up_time=0}exports.menu_up=menu_up=false
if(!glov_engine.is_loading&&glov_engine.getFrameDtActual()>50&&pp_this_frame){pp_bad_frames=(pp_bad_frames||0)+1
if(pp_bad_frames>=6){glov_engine.postprocessingAllow(false)}}else if(pp_bad_frames){pp_bad_frames=0}spotTopOfFrame()
if(modal_dialog){modalDialogRun()}}function endFrame(){spotEndOfFrame()
if(glov_input.click({x:-Infinity,y:-Infinity,w:Infinity,h:Infinity})){spotUnfocus()}while(dom_elems_issued<dom_elems.length){var elem=dom_elems.pop()
dynamic_text_elem.removeChild(elem)}}function cleanupDOMElems(){while(dom_elems.length){var elem=dom_elems.pop()
dynamic_text_elem.removeChild(elem)}}function menuUp(param){merge(menu_fade_params,menu_fade_params_default)
if(param){merge(menu_fade_params,param)}exports.menu_up=menu_up=true
glov_input.eatAllInput()}function copyTextToClipboard(text){var textArea=document.createElement("textarea")
textArea.style.position="fixed"
textArea.style.top=0
textArea.style.left=0
textArea.style.width="2em"
textArea.style.height="2em"
textArea.style.border="none"
textArea.style.outline="none"
textArea.style.boxShadow="none"
textArea.style.background="transparent"
textArea.value=text
document.body.appendChild(textArea)
textArea.focus()
textArea.select()
var ret=false
try{ret=document.execCommand("copy")}catch(err){}document.body.removeChild(textArea)
return ret}function provideUserString(title,str){var copy_success=copyTextToClipboard(str)
modalTextEntry({edit_w:400,edit_text:str.replace(/[\n\r]/g," "),title:title,text:copy_success?default_copy_success_msg:default_copy_failure_msg,buttons:{ok:null}})}var draw_rect_param={}
function drawRect(x0,y0,x1,y1,z,color){var mx=min(x0,x1)
var my=min(y0,y1)
var Mx=max(x0,x1)
var My=max(y0,y1)
draw_rect_param.x=mx
draw_rect_param.y=my
draw_rect_param.z=z
draw_rect_param.w=Mx-mx
draw_rect_param.h=My-my
draw_rect_param.color=color
return sprites.white.draw(draw_rect_param)}function drawRect2(param){return sprites.white.draw(param)}var draw_rect_4color_param={}
function drawRect4Color(x0,y0,x1,y1,z,color_ul,color_ur,color_ll,color_lr){var mx=min(x0,x1)
var my=min(y0,y1)
var Mx=max(x0,x1)
var My=max(y0,y1)
draw_rect_4color_param.x=mx
draw_rect_4color_param.y=my
draw_rect_4color_param.z=z
draw_rect_4color_param.w=Mx-mx
draw_rect_4color_param.h=My-my
draw_rect_4color_param.color_ul=color_ul
draw_rect_4color_param.color_ll=color_ll
draw_rect_4color_param.color_lr=color_lr
draw_rect_4color_param.color_ur=color_ur
return sprites.white.draw4Color(draw_rect_4color_param)}function spreadTechParams(spread){spread=min(max(spread,0),.99)
var tech_params={param0:vec4(0,0,0,0)}
tech_params.param0[0]=1/(1-spread)
tech_params.param0[1]=-.5*tech_params.param0[0]+.5
return tech_params}var temp_color=vec4()
function premulAlphaColor(color){temp_color[0]=color[0]*color[3]
temp_color[1]=color[1]*color[3]
temp_color[2]=color[2]*color[3]
temp_color[3]=color[3]
return temp_color}function drawElipseInternal(sprite,x0,y0,x1,y1,z,spread,tu0,tv0,tu1,tv1,color,blend){if(!blend&&!glov_engine.defines.NOPREMUL){blend=BLEND_PREMULALPHA
color=premulAlphaColor(color)}glov_sprites.queueraw(sprite.texs,x0,y0,z,x1-x0,y1-y0,tu0,tv0,tu1,tv1,color,glov_font.font_shaders.font_aa,spreadTechParams(spread),blend)}function drawCircleInternal(sprite,x,y,z,r,spread,tu0,tv0,tu1,tv1,color,blend){var x0=x-r*2+r*4*tu0
var x1=x-r*2+r*4*tu1
var y0=y-r*2+r*4*tv0
var y1=y-r*2+r*4*tv1
drawElipseInternal(sprite,x0,y0,x1,y1,z,spread,tu0,tv0,tu1,tv1,color,blend)}function initCircleSprite(){var CIRCLE_SIZE=32
var data=new Uint8Array(CIRCLE_SIZE*CIRCLE_SIZE)
var midp=(CIRCLE_SIZE-1)/2
for(var i=0;i<CIRCLE_SIZE;i++){for(var j=0;j<CIRCLE_SIZE;j++){var d=sqrt((i-midp)*(i-midp)+(j-midp)*(j-midp))/midp
var v=clamp(1-d,0,1)
data[i+j*CIRCLE_SIZE]=v*255}}sprites.circle=glov_sprites.create({url:"circle",width:CIRCLE_SIZE,height:CIRCLE_SIZE,format:textures.format.R8,data:data,filter_min:gl.LINEAR,filter_mag:gl.LINEAR,wrap_s:gl.CLAMP_TO_EDGE,wrap_t:gl.CLAMP_TO_EDGE,origin:vec2(.5,.5)})}function drawElipse(x0,y0,x1,y1,z,spread,color,blend){if(!sprites.circle){initCircleSprite()}drawElipseInternal(sprites.circle,x0,y0,x1,y1,z,spread,0,0,1,1,color,blend)}function drawCircle(x,y,z,r,spread,color,blend){if(!sprites.circle){initCircleSprite()}drawCircleInternal(sprites.circle,x,y,z,r,spread,0,0,1,1,color,blend)}function drawHollowCircle(x,y,z,r,spread,color,blend){if(!sprites.hollow_circle){var CIRCLE_SIZE=128
var LINE_W=2
var data=new Uint8Array(CIRCLE_SIZE*CIRCLE_SIZE)
var midp=(CIRCLE_SIZE-1)/2
for(var i=0;i<CIRCLE_SIZE;i++){for(var j=0;j<CIRCLE_SIZE;j++){var d=sqrt((i-midp)*(i-midp)+(j-midp)*(j-midp))/midp
var v=clamp(1-d,0,1)
if(v>.5){v=1-v}v+=LINE_W/CIRCLE_SIZE
data[i+j*CIRCLE_SIZE]=v*255}}sprites.hollow_circle=glov_sprites.create({url:"hollow_circle",width:CIRCLE_SIZE,height:CIRCLE_SIZE,format:textures.format.R8,data:data,filter_min:gl.LINEAR,filter_mag:gl.LINEAR,wrap_s:gl.CLAMP_TO_EDGE,wrap_t:gl.CLAMP_TO_EDGE,origin:vec2(.5,.5)})}drawCircleInternal(sprites.hollow_circle,x,y,z,r,spread,0,0,1,1,color,blend)}var LINE_TEX_W=16
var LINE_TEX_H=16
var LINE_MIDP=floor((LINE_TEX_H-1)/2)
var LINE_V0=.5/LINE_TEX_H
var LINE_V1=1-1.5/LINE_TEX_H
var LINE_U0=.5/LINE_TEX_W
var LINE_U1=(LINE_MIDP+.5)/LINE_TEX_W
var LINE_U2=1-LINE_U1
var LINE_U3=1-.5/LINE_TEX_W
function drawLine(x0,y0,x1,y1,z,w,precise,color,mode){if(mode===undefined){mode=default_line_mode}var blend
if(!glov_engine.defines.NOPREMUL){blend=BLEND_PREMULALPHA
color=premulAlphaColor(color)}var tex_key=mode&LINE_CAP_ROUND?"line3":"line2"
if(!sprites[tex_key]){var data=new Uint8Array(LINE_TEX_W*LINE_TEX_H)
var i1=LINE_MIDP
var i2=LINE_TEX_W-1-LINE_MIDP
if(tex_key==="line2"){for(var j=0;j<LINE_TEX_H;j++){var d=abs((j-LINE_MIDP)/LINE_MIDP)
var j_value=round(clamp(1-d,0,1)*255)
for(var i=0;i<LINE_TEX_W;i++){d=i<i1?i/LINE_MIDP:i>=i2?1-(i-i2)/LINE_MIDP:1
var i_value=round(clamp(d,0,1)*255)
data[i+j*LINE_TEX_W]=min(i_value,j_value)}}}else{for(var _j=0;_j<LINE_TEX_H;_j++){var _d=abs((_j-LINE_MIDP)/LINE_MIDP)
for(var _i4=0;_i4<LINE_TEX_W;_i4++){var id=_i4<i1?1-_i4/LINE_MIDP:_i4>=i2?(_i4-i2)/LINE_MIDP:0
var dv=sqrt(id*id+_d*_d)
dv=clamp(1-dv,0,1)
data[_i4+_j*LINE_TEX_W]=round(dv*255)}}}sprites[tex_key]=glov_sprites.create({url:tex_key,width:LINE_TEX_W,height:LINE_TEX_H,format:textures.format.R8,data:data,filter_min:gl.LINEAR,filter_mag:gl.LINEAR,wrap_s:gl.CLAMP_TO_EDGE,wrap_t:gl.CLAMP_TO_EDGE})}var texs=sprites[tex_key].texs
var camera_xscale=camera2d.data[4]
var camera_yscale=camera2d.data[5]
var virtual_to_pixels=(camera_xscale+camera_yscale)*.5
var pixels_to_virutal=1/virtual_to_pixels
var w_in_pixels=w*virtual_to_pixels
var draw_w_pixels=w_in_pixels+2*2
var half_draw_w_pixels=draw_w_pixels*.5
var draw_w=half_draw_w_pixels*pixels_to_virutal
var dx=x1-x0
var dy=y1-y0
var length=sqrt(dx*dx+dy*dy)
dx/=length
dy/=length
var tangx=-dy*draw_w
var tangy=dx*draw_w
if(mode&LINE_ALIGN){var y0_real=(y0-camera2d.data[1])*camera2d.data[5]
var y0_real_aligned=round(y0_real-half_draw_w_pixels)+half_draw_w_pixels
var yoffs=(y0_real_aligned-y0_real)/camera2d.data[5]
y0+=yoffs
y1+=yoffs
var x0_real=(x0-camera2d.data[0])*camera2d.data[4]
var x0_real_aligned=round(x0_real-half_draw_w_pixels)+half_draw_w_pixels
var xoffs=(x0_real_aligned-x0_real)/camera2d.data[4]
x0+=xoffs
x1+=xoffs}var tex_delta_for_pixel=2/draw_w_pixels
var step_start=1-(w_in_pixels+1)/draw_w_pixels
var step_end=step_start+tex_delta_for_pixel
step_end=1+precise*(step_end-1)
var A=1/(step_end-step_start)
var B=-step_start*A
var shader_param={param0:[A,B]}
glov_sprites.queueraw4(texs,x1+tangx,y1+tangy,x1-tangx,y1-tangy,x0-tangx,y0-tangy,x0+tangx,y0+tangy,z,LINE_U1,LINE_V0,LINE_U2,LINE_V1,color,glov_font.font_shaders.font_aa,shader_param,blend)
if(mode&(LINE_CAP_ROUND|LINE_CAP_SQUARE)){var nx=dx*w/2
var ny=dy*w/2
glov_sprites.queueraw4(texs,x1-tangx,y1-tangy,x1+tangx,y1+tangy,x1+tangx+nx,y1+tangy+ny,x1-tangx+nx,y1-tangy+ny,z,LINE_U2,LINE_V1,LINE_U3,LINE_V0,color,glov_font.font_shaders.font_aa,shader_param,blend)
glov_sprites.queueraw4(texs,x0-tangx,y0-tangy,x0+tangx,y0+tangy,x0+tangx-nx,y0+tangy-ny,x0-tangx-nx,y0-tangy-ny,z,LINE_U1,LINE_V1,LINE_U0,LINE_V0,color,glov_font.font_shaders.font_aa,shader_param,blend)}}function drawHollowRect(x0,y0,x1,y1,z,w,precise,color,mode){drawLine(x0,y0,x1,y0,z,w,precise,color,mode)
drawLine(x1,y0,x1,y1,z,w,precise,color,mode)
drawLine(x1,y1,x0,y1,z,w,precise,color,mode)
drawLine(x0,y1,x0,y0,z,w,precise,color,mode)}function drawHollowRect2(param){drawHollowRect(param.x,param.y,param.x+param.w,param.y+param.h,param.z||Z.UI,param.line_width||1,param.precise||1,param.color||unit_vec)}function drawCone(x0,y0,x1,y1,z,w0,w1,spread,color){var blend
if(!glov_engine.defines.NOPREMUL){blend=BLEND_PREMULALPHA
color=premulAlphaColor(color)}if(!sprites.cone){var CONE_SIZE=32
var data=new Uint8Array(CONE_SIZE*CONE_SIZE)
var midp=(CONE_SIZE-1)/2
for(var i=0;i<CONE_SIZE;i++){for(var j=0;j<CONE_SIZE;j++){var _dx=0
var _dy=0
var d=0
if(i>midp){_dx=(i-midp)/midp
_dy=abs(j-midp)/midp
var dCircle=sqrt(_dx*_dx+_dy*_dy)
d=_dx*dCircle}var v=clamp(1-d,0,1)
data[i+j*CONE_SIZE]=v*255}}sprites.cone=glov_sprites.create({url:"cone",width:CONE_SIZE,height:CONE_SIZE,format:textures.format.R8,data:data,filter_min:gl.LINEAR,filter_mag:gl.LINEAR,wrap_s:gl.CLAMP_TO_EDGE,wrap_t:gl.CLAMP_TO_EDGE,origin:vec2(.5,.5)})}var dx=x1-x0
var dy=y1-y0
var length=sqrt(dx*dx+dy*dy)
dx/=length
dy/=length
var tangx=-dy
var tangy=dx
glov_sprites.queueraw4(sprites.cone.texs,x0-tangx*w0,y0-tangy*w0,x0+tangx*w0,y0+tangy*w0,x1+tangx*w1,y1+tangy*w1,x1-tangx*w1,y1-tangy*w1,z,0,0,1,1,color,glov_font.font_shaders.font_aa,spreadTechParams(spread),blend)}function setFontHeight(_font_height){exports.font_height=font_height=_font_height
fontSetDefaultSize(font_height)}function scaleSizes(scale){exports.button_height=button_height=round(32*scale)
setFontHeight(round(24*scale))
exports.button_width=button_width=round(200*scale)
exports.button_img_size=button_img_size=button_height
exports.modal_button_width=modal_button_width=round(button_width/2)
exports.modal_width=modal_width=round(600*scale)
exports.modal_y0=modal_y0=round(200*scale)
exports.modal_title_scale=modal_title_scale=1.2
exports.modal_pad=modal_pad=round(16*scale)
exports.tooltip_width=tooltip_width=round(400*scale)
exports.tooltip_pad=tooltip_pad=round(8*scale)
exports.panel_pixel_scale=panel_pixel_scale=button_height/sprites.panel.uidata.total_h
exports.tooltip_panel_pixel_scale=tooltip_panel_pixel_scale=panel_pixel_scale
scrollAreaSetPixelScale(button_height/sprites.button.uidata.total_h)}function setPanelPixelScale(scale){exports.tooltip_panel_pixel_scale=tooltip_panel_pixel_scale=exports.panel_pixel_scale=panel_pixel_scale=scale}function setModalSizes(_modal_button_width,width,y0,title_scale,pad){exports.modal_button_width=modal_button_width=_modal_button_width||round(button_width/2)
exports.modal_width=modal_width=width||600
exports.modal_y0=modal_y0=y0||200
exports.modal_title_scale=modal_title_scale=title_scale||1.2
exports.modal_pad=modal_pad=pad||modal_pad}function setTooltipWidth(_tooltip_width,_tooltip_panel_pixel_scale){exports.tooltip_width=tooltip_width=_tooltip_width
exports.tooltip_panel_pixel_scale=tooltip_panel_pixel_scale=_tooltip_panel_pixel_scale
exports.tooltip_pad=tooltip_pad=modal_pad/2*_tooltip_panel_pixel_scale}

},{"../common/util.js":89,"../common/vmath.js":91,"./camera2d.js":13,"./edit_box.js":18,"./effects.js":19,"./engine.js":20,"./font.js":26,"./input.js":36,"./link.js":37,"./localization.js":39,"./mat43.js":40,"./scroll_area.js":53,"./sound.js":61,"./spot.js":63,"./sprites.js":65,"./textures.js":67,"assert":undefined}],70:[function(require,module,exports){
"use strict"
exports.run=run
exports.runFontTest=runFontTest
var assert=require("assert")
var _glovCommonVmath=require("../common/vmath")
var vec4=_glovCommonVmath.vec4
var _color_pickerJs=require("./color_picker.js")
var colorPicker=_color_pickerJs.colorPicker
var _edit_box=require("./edit_box")
var editBoxCreate=_edit_box.editBoxCreate
var _engineJs=require("./engine.js")
var engine=_engineJs
var _font=require("./font")
var ALIGN=_font.ALIGN
var fontStyle=_font.fontStyle
var fontStyleAlpha=_font.fontStyleAlpha
var _inputJs=require("./input.js")
var input=_inputJs
var _linkJs=require("./link.js")
var linkText=_linkJs.linkText
var _scroll_area=require("./scroll_area")
var scrollAreaCreate=_scroll_area.scrollAreaCreate
var _selection_box=require("./selection_box")
var dropDownCreate=_selection_box.dropDownCreate
var selectionBoxCreate=_selection_box.selectionBoxCreate
var _simple_menu=require("./simple_menu")
var simpleMenuCreate=_simple_menu.simpleMenuCreate
var _sliderJs=require("./slider.js")
var slider=_sliderJs.slider
var _uiJs=require("./ui.js")
var ui=_uiJs
var _urlhashJs=require("./urlhash.js")
var getURLBase=_urlhashJs.getURLBase
var ceil=Math.ceil,max=Math.max,random=Math.random
var demo_menu
var demo_menu_up=false
var demo_result
var font_style
var inited
var edit_box1
var edit_box2
var test_select1
var test_dropdown
var test_dropdown_large
var test_scroll_area
var slider_value=.75
var test_lines=10
var test_color=vec4(1,0,1,1)
function init(x,y,column_width){edit_box1=editBoxCreate({x:x+column_width,y:y,w:column_width-8})
edit_box2=editBoxCreate({x:x+column_width+column_width,y:y,w:column_width-8})
demo_menu=simpleMenuCreate({items:["Option 1",{name:"Option 2",tag:"opt2"},{name:"Option C",cb:function cb(){demo_result="Callback the third"}}]})
font_style=fontStyle(null,{outline_width:1,outline_color:2147483903,glow_xoffs:3.25,glow_yoffs:3.25,glow_inner:-2.5,glow_outer:5,glow_color:255})
test_select1=selectionBoxCreate({items:["Apples","Bananas","Chameleon"],z:Z.UI,width:column_width-8})
test_dropdown=dropDownCreate({items:["Apples","Bananas","Chameleon",{name:"Disabled",disabled:true}],z:Z.UI,width:column_width-8})
var items=[]
for(var ii=0;ii<100;++ii){items.push("item"+ii)}test_dropdown_large=dropDownCreate({items:items,z:Z.UI,width:column_width-8})
test_scroll_area=scrollAreaCreate()}function run(x,y,z){var font=ui.font
z=z||Z.UI
var line_height=ui.button_height+2
var column_width=ui.button_width+8
if(inited!==x+"_"+y+"_"+column_width){init(x,y,column_width)
inited=x+"_"+y+"_"+column_width}if(demo_menu_up){demo_result=""
demo_menu.run({x:x+ui.button_width,y:y+line_height,z:Z.MODAL})
if(demo_menu.isSelected()){if(demo_menu.isSelected("opt2")){demo_result="Selected the second option"}if(!demo_result){demo_result="Menu selected: "+demo_menu.getSelectedItem().name}demo_menu_up=false}ui.menuUp()
input.eatAllInput()}var pad=4
if(ui.buttonText({x:x,y:y,z:z,text:"Modal Dialog",tooltip:"Shows a modal dialog"})){demo_result=""
ui.modalDialog({title:"Modal Dialog",text:"This is a modal dialog!",buttons:{OK:function OK(){demo_result="OK pushed!"},Cancel:null}})}if(edit_box1.run()===edit_box1.SUBMIT){ui.modalDialog({title:"Modal Dialog",text:"Edit box submitted with text "+edit_box1.getText(),buttons:{OK:null}})}if(edit_box2.run()===edit_box2.SUBMIT){edit_box2.setText("")}if(ui.buttonText({x:edit_box2.x+edit_box2.w+pad,y:y,z:z,text:"...",w:ui.button_height})){ui.modalTextEntry({title:"Type something",edit_text:edit_box2.getText(),buttons:{ok:function ok(text){edit_box2.setText(text)},cancel:null}})}y+=line_height
if(ui.buttonText({x:x,y:y,z:z,text:"Menu",tooltip:"Shows a menu"})){demo_menu_up=true}colorPicker({x:x+column_width,y:y,z:z,color:test_color})
test_scroll_area.begin({x:x+column_width+4+line_height,y:y+4,z:z,w:100,h:ui.font_height*8+pad})
var internal_y=2
internal_y+=font.drawSizedAligned(font_style,2,internal_y,z+1,ui.font_height,ALIGN.HWRAP|ALIGN.HFIT,100-test_scroll_area.barWidth()-2,0,"Edit Box Text: "+edit_box1.getText()+"+"+edit_box2.getText())+pad
ui.print(font_style,2,internal_y,z+1,"Result: "+demo_result)
internal_y+=ui.font_height+pad
ui.print(font_style,2,internal_y,z+1,"Dropdown: "+test_dropdown.getSelected().name)
internal_y+=ui.font_height+pad
linkText({x:2,y:internal_y,text:"Ext URL",url:"https://github.com/jimbly/glovjs"})
if(linkText({x:column_width/2,y:internal_y,text:"Int URL",internal:true,url:engine.defines.SPOT_DEBUG?getURLBase():getURLBase()+"?D=SPOT_DEBUG"})){engine.defines.SPOT_DEBUG=!engine.defines.SPOT_DEBUG}internal_y+=ui.font_height+pad
internal_y+=test_dropdown_large.run({x:2,y:internal_y,z:z+1})+pad
if(ui.buttonText({x:2,y:internal_y,z:z,text:"Disabled",tooltip:"A disabled button",disabled:true})){assert(false)}internal_y+=ui.button_height+pad
for(var ii=0;ii<test_lines;++ii){ui.print(font_style,2,internal_y,z+1,"Line #"+ii)
internal_y+=ui.font_height+pad}if(ui.buttonText({x:2,y:internal_y,z:z+1,text:"Add Line",key:"add_line"})){++test_lines}internal_y+=ui.button_height+pad
if(ui.buttonText({x:2,y:internal_y,z:z+1,text:"Remove Line",key:"remove_line"})){--test_lines}internal_y+=ui.button_height+pad
test_scroll_area.end(internal_y)
ui.panel({x:test_scroll_area.x-pad,y:test_scroll_area.y-pad,z:z-1,w:test_scroll_area.w+pad*2,h:test_scroll_area.h+pad*2})
y+=line_height
y+=test_select1.run({x:x,y:y,z:z})
y+=test_dropdown.run({x:x,y:y,z:z})
y=max(y,test_scroll_area.y+test_scroll_area.h+pad)
slider_value=slider(slider_value,{x:x,y:y,z:z,min:0,max:2})
ui.print(null,x+ui.button_width+pad,y,z,""+slider_value.toFixed(2))
ui.progressBar({x:x+ui.button_width+pad*2+ui.font_height*2,y:y,z:z,w:60,h:ui.button_height,progress:slider_value})
y+=ui.button_height}function runFontTest(x,y){var COLOR_RED=4278190335
var COLOR_GREEN=16711935
var COLOR_WHITE=4294967295
var COLOR_INVISIBLE=0
var z=Z.UI
var font=ui.font
var font_size=ui.font_height*2
font.drawSized(null,x,y,z,font_size,"Default "+font_size+" "+random().toFixed(7))
y+=font_size
font.drawSized(null,x,y,z,font_size/2,"Default "+font_size/2+" Lorem ipsum dolor sit amet <[A|B]>")
y+=ceil(font_size/2)
font.drawSized(null,x,y,z,font_size/4,"Default "+font_size/4+" The quick brown fox jumped over the lazy dog rutabaga Alfalfa")
y+=ceil(font_size/4)
var font_style_outline=fontStyle(null,{outline_width:1,outline_color:COLOR_RED,glow_xoffs:0,glow_yoffs:0,glow_inner:0,glow_outer:0,glow_color:COLOR_INVISIBLE,color:COLOR_WHITE})
var font_style_outline_dim=fontStyle(null,{outline_width:1,outline_color:127,glow_xoffs:0,glow_yoffs:0,glow_inner:0,glow_outer:0,glow_color:COLOR_INVISIBLE,color:COLOR_WHITE})
var font_style_outline_dim2=fontStyle(null,{outline_width:1,outline_color:4278190207,glow_xoffs:0,glow_yoffs:0,glow_inner:0,glow_outer:0,glow_color:COLOR_INVISIBLE,color:COLOR_WHITE})
var xx=x
xx+=font.drawSized(font_style_outline,xx,y,z,font_size,"Outline ")
xx+=font.drawSized(font_style_outline_dim,xx,y,z,font_size,"Dim ")
xx+=font.drawSized(font_style_outline_dim2,xx,y,z,font_size,"Out")
xx+=font.drawSized(fontStyleAlpha(font_style_outline_dim2,.5),xx,y,z,font_size,"line")
y+=font_size
var font_style_glow=fontStyle(null,{outline_width:0,outline_color:COLOR_INVISIBLE,glow_xoffs:0,glow_yoffs:0,glow_inner:-1,glow_outer:4,glow_color:COLOR_GREEN,color:COLOR_WHITE})
var font_style_glow_dim=fontStyle(null,{outline_width:0,outline_color:COLOR_INVISIBLE,glow_xoffs:0,glow_yoffs:0,glow_inner:-1,glow_outer:4,glow_color:16711712,color:COLOR_WHITE})
var font_style_glow_dim_on_dim=fontStyle(null,{outline_width:0,outline_color:COLOR_INVISIBLE,glow_xoffs:0,glow_yoffs:0,glow_inner:-1,glow_outer:4,glow_color:16711712,color:4294967168})
xx=x
xx+=font.drawSized(font_style_glow,xx,y,z,font_size,"Glow ")
xx+=font.drawSized(font_style_glow_dim,xx,y,z,font_size,"Dim ")
font.drawSized(font_style_glow_dim_on_dim,xx,y,z,font_size,"Glow ")
y+=font_size
var font_style_shadow=fontStyle(null,{outline_width:0,outline_color:COLOR_INVISIBLE,glow_xoffs:4,glow_yoffs:4,glow_inner:-2.5,glow_outer:5,glow_color:COLOR_GREEN,color:COLOR_WHITE})
font.drawSized(font_style_shadow,x,y,z,font_size,"Glow (Shadow) O0O1Il")
y+=font_size
var font_style_both=fontStyle(null,{outline_width:1,outline_color:COLOR_RED,glow_xoffs:0,glow_yoffs:0,glow_inner:0,glow_outer:6,glow_color:COLOR_GREEN,color:COLOR_WHITE})
var font_style_both_soft_on_hard=fontStyle(null,{outline_width:1,outline_color:4278190207,glow_xoffs:0,glow_yoffs:0,glow_inner:0,glow_outer:6,glow_color:COLOR_GREEN,color:COLOR_WHITE})
var font_style_both_hard_on_soft=fontStyle(null,{outline_width:1,outline_color:COLOR_RED,glow_xoffs:0,glow_yoffs:0,glow_inner:0,glow_outer:6,glow_color:16711744,color:COLOR_WHITE})
var font_style_both_soft_on_soft=fontStyle(null,{outline_width:1,outline_color:4278190207,glow_xoffs:0,glow_yoffs:0,glow_inner:0,glow_outer:6,glow_color:16711744,color:COLOR_WHITE})
xx=x
xx+=font.drawSized(font_style_both,xx,y,z,font_size,"B")
xx+=font.drawSized(fontStyleAlpha(font_style_both,.75),xx,y,z,font_size,"o")
xx+=font.drawSized(fontStyleAlpha(font_style_both,.5),xx,y,z,font_size,"t")
xx+=font.drawSized(fontStyleAlpha(font_style_both,.25),xx,y,z,font_size,"h ")
xx+=font.drawSized(font_style_both_soft_on_hard,xx,y,z,font_size,"SoH ")
xx+=font.drawSized(font_style_both_hard_on_soft,xx,y,z,font_size,"HoH ")
font.drawSized(font_style_both_soft_on_soft,xx,y,z,font_size,"SoS 0O0")
y+=font_size
var font_size2=32
var font_style_both2=fontStyle(null,{outline_width:1.75,outline_color:COLOR_RED,glow_xoffs:.25,glow_yoffs:.25,glow_inner:0,glow_outer:5,glow_color:2139062271,color:COLOR_WHITE})
font.drawSizedAligned(font_style_both2,x,y,z,font_size2,ALIGN.HFIT,ui.button_width*2,0,"ALIGN.HFIT The quick brown fox jumps over the lazy dog")
y+=font_size2
var test="glow"
if(test==="outline"){var font_style_outline2=fontStyle(null,{outline_width:1,outline_color:COLOR_RED,glow_xoffs:0,glow_yoffs:0,glow_inner:0,glow_outer:0,glow_color:COLOR_INVISIBLE,color:COLOR_WHITE})
for(var ii=1;ii<=4;ii++){font.drawSizedAligned(fontStyle(font_style_outline2,{outline_width:ii*2}),x,y,z,font_size2,ALIGN.HLEFT,400,0,"Outline thickness "+ii*2)
y+=font_size2}}else if(test==="glow"){var font_style_glow2=fontStyle(null,{outline_width:0,outline_color:COLOR_INVISIBLE,glow_xoffs:0,glow_yoffs:0,glow_inner:0,glow_outer:8,glow_color:COLOR_RED,color:COLOR_WHITE})
for(var _ii=1;_ii<=4;_ii++){font.drawSizedAligned(fontStyle(font_style_glow2,{glow_outer:_ii*2}),x,y,z,font_size2,ALIGN.HLEFT,400,0,"Glow outer "+_ii*2)
y+=font_size2}}else if(test==="wrap"){y+=font.drawSizedWrapped(null,x,y,z,400,24,font_size2,"Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor"+" incididunt utlaboreetdoloremagnaaliqua.")}}

},{"../common/vmath":91,"./color_picker.js":17,"./edit_box":18,"./engine.js":20,"./font":26,"./input.js":36,"./link.js":37,"./scroll_area":53,"./selection_box":54,"./simple_menu":58,"./slider.js":59,"./ui.js":69,"./urlhash.js":71,"assert":undefined}],71:[function(require,module,exports){
"use strict"
exports.TYPE_STRING=exports.TYPE_SET=void 0
exports.get=get
exports.getURLBase=getURLBase
exports.getURLPageBase=getURLPageBase
exports.go=go
exports.onChange=onChange
exports.onURLChange=onURLChange
exports.refreshTitle=refreshTitle
exports.register=register
exports.route=route
exports.routeFixed=routeFixed
exports.set=set
exports.setMulti=setMulti
exports.startup=startup
var assert=require("assert")
var _require=require("../common/util.js"),callEach=_require.callEach
var HISTORY_UPDATE_TIME=1e3
var TYPE_SET="set"
exports.TYPE_SET=TYPE_SET
var TYPE_STRING="string"
exports.TYPE_STRING=TYPE_STRING
var params={}
var title_transformer
var page_base=(document.location.href||"").match(/^[^#?]+/)[0]
if(!page_base.endsWith("/")){page_base+="?"}var url_base=page_base.replace(/[^/]*$/,"")
var on_change=[]
function getURLBase(){return url_base}function getURLPageBase(){return page_base}function onChange(cb){on_change.push(cb)}function cmpNumKeys(a,b){var d=b.keys.length-a.keys.length
if(d){return d}for(var ii=0;ii<a.keys.length;++ii){if(a.keys[ii]<b.keys[ii]){return-1}else if(a.keys[ii]>b.keys[ii]){return 1}}assert(false)
return 0}var route_param_regex=/:(\w+)/g
var routes=[]
function queryString(){var href=String(document.location)
return href.slice(page_base.length)}var regex_value=/[^\w]\w+=([^&]+)/
function getValue(query_string,opts){if(opts.routes){for(var ii=0;ii<opts.routes.length;++ii){var r=opts.routes[ii]
var _m=query_string.match(r.regex)
if(_m){if(r.value){return r.value}var idx=r.keys.indexOf(opts.key)
return _m[1+idx]}}}var m=query_string.match(opts.regex)||[]
if(opts.type===TYPE_SET){var _r={}
for(var _ii=0;_ii<m.length;++_ii){var m2=m[_ii].match(regex_value)
assert(m2)
_r[m2[1]]=1}return _r}else{return m[1]||opts.def}}var last_history_str=null
function goInternal(query_string){var hidden={}
for(var key in params){var opts=params[key]
if(opts.hides){if(getValue(query_string,opts)){for(var otherkey in opts.hides){hidden[otherkey]=1}}}}var dirty={}
for(var _key in params){if(hidden[_key]){continue}var _opts=params[_key]
var new_value=getValue(query_string,_opts)
if(_opts.type===TYPE_SET){for(var v in new_value){if(!_opts.value[v]){_opts.value[v]=1
dirty[_key]=true}}for(var _v in _opts.value){if(!new_value[_v]){delete _opts.value[_v]
dirty[_key]=true}}}else{if(new_value!==_opts.value){dirty[_key]=true
_opts.value=new_value}}}for(var _key2 in dirty){var _opts2=params[_key2]
if(_opts2.change){_opts2.change(_opts2.value)}}callEach(on_change)}var eff_title
function toString(){eff_title=""
var values=[]
var hidden={}
for(var key in params){var opts=params[key]
if(opts.hides&&opts.value){for(var otherkey in opts.hides){hidden[otherkey]=1}}}var root_value=""
outer:for(var ii=0;ii<routes.length;++ii){var r=routes[ii]
var route_title=""
for(var jj=0;jj<r.keys.length;++jj){var _key3=r.keys[jj]
if(hidden[_key3]){continue outer}var _opts3=params[_key3]
if(_opts3.hide_values[_opts3.value]){continue outer}if(!route_title&&_opts3.title){route_title=_opts3.title(_opts3.value)}}for(var _jj=0;_jj<r.keys.length;++_jj){var _key4=r.keys[_jj]
if(params[_key4].route_only){hidden[_key4]=true}}root_value=r.route_string.replace(route_param_regex,function(ignored,key){hidden[key]=true
return String(params[key].value)})
if(!eff_title&&route_title){eff_title=route_title}break}for(var _key5 in params){if(hidden[_key5]){continue}var _opts4=params[_key5]
if(_opts4.type===TYPE_SET){for(var v in _opts4.value){values.push(_key5+"="+v)}}else{if(!_opts4.hide_values[_opts4.value]){values.push(_key5+"="+_opts4.value)
if(!eff_title&&_opts4.title){eff_title=_opts4.title(_opts4.value)}}}}if(title_transformer){eff_title=title_transformer(eff_title)}eff_title=String(eff_title)
return""+root_value+(values.length?"?":"")+values.join("&")}function refreshTitle(){toString()
if(eff_title&&eff_title!==document.title){document.title=eff_title}}function periodicRefreshTitle(){profilerStart("periodicRefreshTitle")
refreshTitle()
setTimeout(periodicRefreshTitle,1e3)
profilerStop()}function onPopState(){var query_string=queryString()
last_history_str=query_string
goInternal(query_string)
refreshTitle()}var on_url_change
function onURLChange(cb){on_url_change=cb}var last_history_set_time=0
var scheduled=false
var need_push_state=false
function updateHistoryCommit(){profilerStart("updateHistoryCommit")
scheduled=false
last_history_set_time=Date.now()
var url=""+page_base+last_history_str
if(url.endsWith("?")){url=url.slice(0,-1)}try{if(need_push_state){need_push_state=false
window.history.pushState(undefined,eff_title,url)}else{window.history.replaceState(undefined,eff_title,url)}}catch(e){}if(eff_title){document.title=eff_title}if(on_url_change){on_url_change()}profilerStop()}function updateHistory(new_need_push_state){var new_str=toString()
if(last_history_str===new_str){return}need_push_state=need_push_state||new_need_push_state
last_history_str=new_str
if(scheduled){return}var delay=HISTORY_UPDATE_TIME
if(Date.now()-last_history_set_time>HISTORY_UPDATE_TIME){delay=1}scheduled=true
setTimeout(updateHistoryCommit,delay)}function startup(param){assert(!title_transformer)
title_transformer=param.title_transformer
if(!title_transformer&&(param.title_suffix||param.title_default)){var title_suffix=param.title_suffix,title_default=param.title_default
title_transformer=function title_transformer(title){if(title_suffix&&title){return title+" | "+title_suffix}return title||title_default||title_suffix}}updateHistory(false)
if(title_transformer){refreshTitle()
setTimeout(periodicRefreshTitle,1e3)}}function routeEx(new_route){var keys=new_route.keys
for(var ii=0;ii<keys.length;++ii){var opts=params[keys[ii]]
assert(opts)
opts.routes=opts.routes||[]
opts.routes.push(new_route)
opts.value=getValue(queryString(),opts)}routes.push(new_route)
routes.sort(cmpNumKeys)}function route(route_string){var keys=[]
var base=route_string.replace(route_param_regex,function(ignored,match){keys.push(match)
return"([^/&?]+)"})
var regex=new RegExp("^"+base+"(?:$|\\?)")
routeEx({route_string:route_string,regex:regex,keys:keys})}function routeFixed(route_string,key){var regex=new RegExp("^"+route_string+"(?:$|\\?)")
routeEx({route_string:route_string,regex:regex,value:"1",keys:[key]})}function register(opts){assert(opts.key)
assert(!params[opts.key])
opts.type=opts.type||TYPE_STRING
var regex_search="(?:[^\\w])"+opts.key+"=([^&]+)"
var regex_type=""
if(opts.type===TYPE_SET){regex_type="g"}else{opts.def=opts.def||""
opts.hide_values=opts.hide_values||{}
opts.hide_values[opts.def]=true}opts.regex=new RegExp(regex_search,regex_type)
params[opts.key]=opts
opts.value=getValue(queryString(),opts)
var ret=opts.value
if(opts.type===TYPE_SET&&typeof Proxy==="function"){ret=new Proxy(opts.value,{set:function set(target,prop,value){if(value){target[prop]=1}else{delete target[prop]}updateHistory()
return true}})}if(!window.onpopstate){window.onpopstate=onPopState}return ret}function set(key,value,value2){var opts=params[key]
assert(opts)
if(opts.type===TYPE_SET){if(Boolean(opts.value[value])!==Boolean(value2)){opts.value[value]=value2?1:0
updateHistory(opts.push)}}else{if(opts.value!==value){opts.value=value
updateHistory(opts.push)}}}function setMulti(values){var any=false
var push=false
for(var key in values){var value=values[key]
var opts=params[key]
assert(opts)
assert(opts.type!==TYPE_SET)
if(opts.value!==value){opts.value=value
any=true
push=push||opts.push}}if(any){updateHistory(push)}}function get(key){var opts=params[key]
assert(opts)
return opts.value}function go(query_string){goInternal(query_string)
updateHistory(true)}

},{"../common/util.js":89,"assert":undefined}],72:[function(require,module,exports){
"use strict"
var floor=Math.floor,min=Math.min
var offs=0
function now(){return Date.now()+offs}module.exports=exports=now
exports.now=now
var first=true
exports.sync=function(server_time){if(first){offs=server_time-Date.now()}else{offs=min(offs,server_time-Date.now())}}
function toSS2020(milliseconds){return floor(milliseconds/1e3)-1577836800}exports.toSS2020=toSS2020
exports.seconds=function(){return toSS2020(now())}

},{}],73:[function(require,module,exports){
"use strict"
exports.webFSExists=webFSExists
exports.webFSGetFile=webFSGetFile
exports.webFSGetFileNames=webFSGetFileNames
exports.webFSReportUnused=webFSReportUnused
var assert=require("assert")
var _require=require("./filewatch.js"),filewatchOn=_require.filewatchOn,filewatchTriggerChange=_require.filewatchTriggerChange
var urlhash=require("./urlhash.js")
var _require2=require("../common/util.js"),clone=_require2.clone,deepEqual=_require2.deepEqual
var fs=window.glov_webfs||{}
var decoded={}
var used={}
var active_reload=false
function decode(data){var len=data[0]
var str=data[1]
var u8=new Uint8Array(len)
var idxo=0
var idxi=0
while(idxo<len){var byte=str.charCodeAt(idxi++)
if(byte===126){byte=0}else if(byte===27){byte=str.charCodeAt(idxi++)}u8[idxo++]=byte}assert.equal(idxi,str.length)
assert.equal(idxo,len)
return u8}function webFSGetFileNames(directory){var ret=[]
for(var filename in fs){if(filename.startsWith(directory)){ret.push(filename)}}return ret}function webFSGetFile(filename,encoding){var ret=decoded[filename]
if(ret){return ret}used[filename]=true
assert(window.glov_webfs,"Failed to load fsdata.js")
var data=fs[filename]
assert(data,"Error loading file: "+filename)
if(encoding==="jsobj"){assert(!Array.isArray(data))
ret=active_reload?clone(data):data}else{assert(Array.isArray(data))
if(encoding==="text"){ret=data[1]}else{ret=decode(data)}}decoded[filename]=ret
return ret}function webFSExists(filename){return Boolean(fs[filename])}function webFSReportUnused(ignore_regex){ignore_regex=ignore_regex||/\.(fp|vp)$/
var tot_size=0
for(var filename in fs){if(!used[filename]&&!filename.match(ignore_regex)){console.warn("WebFS file bundled but unreferenced: "+filename)
tot_size+=fs[filename][0]}}if(tot_size){console.warn("WebFS wasting "+tot_size+" bytes")}}function webFSReload(){active_reload=true
window.glov_webfs=null
var scriptTag=document.createElement("script")
scriptTag.src=urlhash.getURLBase()+"fsdata.js?rl="+Date.now()
scriptTag.onload=function(){if(window.glov_webfs){var old_fs=fs
fs=window.glov_webfs
decoded={}
used={}
for(var key in fs){var old_value=old_fs[key]
var new_value=fs[key]
if(Array.isArray(old_value)){for(var ii=0;ii<new_value.length;++ii){if(!old_value||new_value[ii]!==old_value[ii]){filewatchTriggerChange(key)
break}}}else{if(!deepEqual(old_value,new_value)){filewatchTriggerChange(key)}}}}}
document.getElementsByTagName("head")[0].appendChild(scriptTag)}filewatchOn("fsdata.js",webFSReload)

},{"../common/util.js":89,"./filewatch.js":25,"./urlhash.js":71,"assert":undefined}],74:[function(require,module,exports){
"use strict"
exports.profanityFilter=profanityFilter
exports.profanityStartup=profanityStartup
var _require=require("../../common/rand_alea.js"),mashString=_require.mashString
var _require2=require("../rand_fast.js"),randFastCreate=_require2.randFastCreate
var _require3=require("../../common/words/profanity_common.js"),profanityFilterCommon=_require3.profanityFilterCommon,profanityCommonStartup=_require3.profanityCommonStartup
var _require4=require("../webfs.js"),webFSGetFile=_require4.webFSGetFile
var non_profanity
function profanityStartup(){non_profanity=webFSGetFile("words/replacements.txt","text").split("\n").filter(function(a){return a})
profanityCommonStartup(webFSGetFile("words/filter.gkg","text"),webFSGetFile("words/exceptions.txt","text"))}var rand=randFastCreate()
var last_word
function randWord(){if(last_word===-1||non_profanity.length===1){last_word=rand.range(non_profanity.length)}else{var choice=rand.range(non_profanity.length-1)
last_word=choice<last_word?choice:choice+1}return non_profanity[last_word]}function profanityFilter(user_str){last_word=-1
rand.seed=mashString(user_str)
return profanityFilterCommon(user_str,randWord)}

},{"../../common/rand_alea.js":87,"../../common/words/profanity_common.js":92,"../rand_fast.js":52,"../webfs.js":73}],75:[function(require,module,exports){
"use strict"
exports.ERR_RESTARTING=exports.ERR_CONNECTING=exports.ERR_CLIENT_VERSION_OLD=exports.ERR_CLIENT_VERSION_NEW=void 0
exports.WSClient=WSClient
var _glovClientEnvironments=require("./environments")
var getAPIPath=_glovClientEnvironments.getAPIPath
var setCurrentEnvironment=_glovClientEnvironments.setCurrentEnvironment
var ack=require("../common/ack.js")
var ackInitReceiver=ack.ackInitReceiver
var assert=require("assert")
var _require=require("./error_report.js"),errorReportSetDetails=_require.errorReportSetDetails,session_uid=_require.session_uid
var _require2=require("./fetch.js"),fetch=_require2.fetch,ERR_CONNECTION=_require2.ERR_CONNECTION
var min=Math.min,random=Math.random
var _require3=require("../common/perfcounters.js"),perfCounterAdd=_require3.perfCounterAdd
var urlhash=require("./urlhash.js")
var wscommon=require("../common/wscommon.js")
var wsHandleMessage=wscommon.wsHandleMessage
var _require4=require("./client_config.js"),PLATFORM=_require4.PLATFORM,getAbilityReload=_require4.getAbilityReload
var ERR_CONNECTING="ERR_CONNECTING"
exports.ERR_CONNECTING=ERR_CONNECTING
var ERR_RESTARTING="ERR_RESTARTING"
exports.ERR_RESTARTING=ERR_RESTARTING
var ERR_CLIENT_VERSION_NEW="ERR_CLIENT_VERSION_NEW"
exports.ERR_CLIENT_VERSION_NEW=ERR_CLIENT_VERSION_NEW
var ERR_CLIENT_VERSION_OLD="ERR_CLIENT_VERSION_OLD"
exports.ERR_CLIENT_VERSION_OLD=ERR_CLIENT_VERSION_OLD
exports.CURRENT_VERSION=0
function WSClient(path){this.id=null
this.my_ids={}
this.handlers={}
this.socket=null
this.net_delayer=null
this.connected=false
this.disconnected=false
this.retry_scheduled=false
this.retry_count=0
this.disconnect_time=Date.now()
this.last_receive_time=Date.now()
this.idle_counter=0
this.last_send_time=Date.now()
this.connect_error=ERR_CONNECTING
ackInitReceiver(this)
if(path){this.path=path}this.connect(false)
this.onMsg("cack",this.onConnectAck.bind(this))
this.onMsg("build",this.onBuildTimestamp.bind(this))
this.onMsg("error",this.onError.bind(this))}WSClient.prototype.logPacketDispatch=function(source,pak,buf_offs,msg){perfCounterAdd("ws."+(typeof msg==="number"?"ack":msg))}
WSClient.prototype.timeSinceDisconnect=function(){return Date.now()-this.disconnect_time}
function getVersionUrlParams(){return"plat="+PLATFORM+"&ver="+exports.CURRENT_VERSION+"&build="+"1659041116850"}function jsonParseResponse(response){if(!response){return null}if(response.trim()[0]==="<"){return null}try{return JSON.parse(response)}catch(e){return null}}function whenServerReady(cb){var retry_count=0
function doit(){fetch({url:getAPIPath()+"ready?"+getVersionUrlParams()},function(err,response){if(err){var response_data=jsonParseResponse(response)
var status=response_data==null?void 0:response_data.status
if(status!=="ERR_CLIENT_VERSION_OLD"){++retry_count
setTimeout(doit,min(retry_count*retry_count*100,15e3)*(.75+random()*.5))
return}}cb()})}doit()}WSClient.prototype.onBuildTimestamp=function(build_timestamp){if(build_timestamp!=="1659041116850"){if(this.on_build_timestamp_mismatch){this.on_build_timestamp_mismatch()}else{if(getAbilityReload()){console.error("App build mismatch (server: "+build_timestamp+", client: "+"1659041116850"+"), reloading")
whenServerReady(function(){if(window.reloadSafe){window.reloadSafe()}else{document.location.reload()}})}else{console.warn("App build mismatch (server: "+build_timestamp+", client: "+"1659041116850"+"), ignoring")}}}}
WSClient.prototype.onConnectAck=function(data,resp_func){var client=this
client.connected=true
client.connect_error=null
client.disconnected=false
client.id=data.id
client.my_ids[data.id]=true
errorReportSetDetails("client_id",client.id)
client.secret=data.secret
if(data.build){client.onBuildTimestamp(data.build)}assert(client.handlers.connect)
data.client_id=client.id
client.handlers.connect(client,data)
resp_func()}
WSClient.prototype.pak=function(msg){return wscommon.wsPak(msg,null,this)}
WSClient.prototype.send=function(msg,data,resp_func){wscommon.sendMessage.call(this,msg,data,resp_func)}
WSClient.prototype.onError=function(e){console.error("WSClient Error")
console.error(e)
if(!(e instanceof Error)){e=new Error(e)}throw e}
WSClient.prototype.onMsg=function(msg,cb){assert.ok(!this.handlers[msg])
this.handlers[msg]=function wrappedCallback(client,data,resp_func){return cb(data,resp_func)}}
WSClient.prototype.checkForNewAppBuild=function(){var _this=this
if(!getAbilityReload()){return}if(this.new_build_check_in_progress){return}this.new_build_check_in_progress=true
fetch({url:urlhash.getURLBase()+"app.ver.json",response_type:"json"},function(err,obj){_this.new_build_check_in_progress=false
if(obj&&obj.ver){_this.onBuildTimestamp(obj.ver)}if(err&&err!==ERR_CONNECTION){if(!_this.delayed_recheck){_this.delayed_recheck=true
setTimeout(function(){_this.delayed_recheck=false
_this.checkForNewAppBuild()},1e3)}}})}
WSClient.prototype.retryConnection=function(){var client=this
assert(!client.socket)
assert(!client.retry_scheduled)
client.retry_scheduled=true;++client.retry_count
this.checkForNewAppBuild()
setTimeout(function(){assert(client.retry_scheduled)
assert(!client.socket)
client.retry_scheduled=false
client.connect(true)},min(client.retry_count*client.retry_count*100,15e3)*(.75+random()*.5))}
WSClient.prototype.checkDisconnect=function(){if(this.connected&&this.socket.readyState!==1){this.on_close()
assert(!this.connected)}}
WSClient.prototype.connect=function(for_reconnect){var _this2=this
var client=this
client.socket={readyState:0}
assert(!this.ready_check_in_progress)
this.ready_check_in_progress=true
fetch({url:getAPIPath()+"ready?"+getVersionUrlParams()},function(err,response){var response_data=jsonParseResponse(response)
var status=response_data==null?void 0:response_data.status
var redirect_environment=response_data==null?void 0:response_data.redirect_environment
var update_available=response_data==null?void 0:response_data.update_available
var should_reload=update_available&&getAbilityReload()
assert(_this2.ready_check_in_progress)
_this2.ready_check_in_progress=false
_this2.connect_error=ERR_CONNECTING
if(!err&&!redirect_environment&&!should_reload){if(update_available){}return void _this2.connectAfterReady(for_reconnect)}console.log("Server not ready, err="+err+", response="+response)
if(status==="ERR_RESTARTING"||status==="ERR_STARTUP"){client.connect_error=ERR_RESTARTING}else if(status==="ERR_CLIENT_VERSION_NEW"){client.connect_error=ERR_CLIENT_VERSION_NEW}else if(status==="ERR_CLIENT_VERSION_OLD"){client.connect_error=ERR_CLIENT_VERSION_OLD}if(redirect_environment){setCurrentEnvironment(redirect_environment)}client.socket=null
client.net_delayer=null
_this2.retryConnection()})}
WSClient.prototype.connectAfterReady=function(for_reconnect){var client=this
var path=client.path||getAPIPath().replace(/^http/,"ws").replace(/api\/$/,"ws")
path=path+"?"+getVersionUrlParams()+(for_reconnect&&client.id&&client.secret?"&reconnect="+client.id+"&secret="+client.secret:"")+"&sesuid="+session_uid
var socket=new WebSocket(path)
socket.binaryType="arraybuffer"
client.socket=socket
function guard(fn){return function(){if(client.socket!==socket){return}fn.apply(void 0,arguments)}}function abort(skip_close){client.socket=null
client.net_delayer=null
if(client.connected){client.disconnect_time=Date.now()
client.disconnected=true
errorReportSetDetails("disconnected",1)}client.connected=false
client.connect_error=ERR_CONNECTING
if(!skip_close){try{socket.close()}catch(e){}}client.handlers.disconnect()
ack.failAll(client)}function retry(skip_close){abort(skip_close)
client.retryConnection()}var connected=false
client.socket.addEventListener("error",guard(function(err){if(!connected){console.log("WebSocket error during initial connection, retrying...",err)
retry()}else{console.error("WebSocket error",err)}}))
client.socket.addEventListener("message",guard(function(message){profilerStart("WS")
assert(message.data instanceof ArrayBuffer)
wsHandleMessage(client,new Uint8Array(message.data))
profilerStop("WS")}))
client.socket.addEventListener("open",guard(function(){console.log("WebSocket open")
connected=true
client.retry_count=0}))
client.on_close=guard(function(){console.log("WebSocket close, retrying connection...")
retry(true)})
client.socket.addEventListener("close",client.on_close)
var doPing=guard(function(){if(Date.now()-client.last_send_time>wscommon.PING_TIME&&client.connected&&client.socket.readyState===1){client.send("ping")}setTimeout(doPing,wscommon.PING_TIME)})
setTimeout(doPing,wscommon.PING_TIME)}

},{"../common/ack.js":76,"../common/perfcounters.js":86,"../common/wscommon.js":93,"./client_config.js":15,"./environments":21,"./error_report.js":22,"./fetch.js":24,"./urlhash.js":71,"assert":undefined}],76:[function(require,module,exports){
"use strict"
exports.ackHandleMessage=ackHandleMessage
exports.ackInitReceiver=ackInitReceiver
exports.ackReadHeader=ackReadHeader
exports.ackWrapPakFinish=ackWrapPakFinish
exports.ackWrapPakPayload=ackWrapPakPayload
exports.ackWrapPakStart=ackWrapPakStart
exports.failAll=failAll
var assert=require("assert")
var _require=require("./packet.js"),isPacket=_require.isPacket
function ackInitReceiver(receiver){receiver.last_pak_id=0
receiver.resp_cbs={}
receiver.responses_waiting=0}var ERR_FAILALL_DISCONNECT="ERR_FAILALL_DISCONNECT"
var ACKFLAG_IS_RESP=1<<3
var ACKFLAG_ERR=1<<4
var ACKFLAG_DATA_JSON=1<<5
function ackWrapPakStart(pak,receiver,msg){var flags=0
pak.ack_data={receiver:receiver}
if(typeof msg==="number"){flags|=ACKFLAG_IS_RESP
pak.writeInt(msg)}else{pak.writeAnsiString(msg)}var resp_pak_id=receiver?++receiver.last_pak_id:0
pak.ack_data.resp_pak_id=resp_pak_id
pak.ack_data.resp_pak_id_offs=pak.getOffset()
pak.writeInt(resp_pak_id)
pak.ack_data.data_offs=pak.getOffset()
pak.ack_data.flags=flags}function ackWrapPakPayload(pak,data){if(isPacket(data)){pak.appendRemaining(data)}else{pak.ack_data.flags|=ACKFLAG_DATA_JSON
pak.writeJSON(data)}}function ackWrapPakFinish(pak,err,resp_func){var flags=pak.ack_data.flags
var offs=pak.getOffset()
if(err){assert.equal(pak.ack_data.data_offs,offs)
flags|=ACKFLAG_ERR
pak.writeString(String(err))
offs=pak.getOffset()}pak.makeReadable()
var resp_pak_id=0
if(resp_func&&resp_func.expecting_response!==false){resp_pak_id=pak.ack_data.resp_pak_id
assert(resp_pak_id)
assert(pak.ack_data.receiver)
pak.ack_data.receiver.resp_cbs[resp_pak_id]=resp_func}else{pak.seek(pak.ack_data.resp_pak_id_offs)
pak.zeroInt()
pak.seek(offs)}pak.updateFlags(flags)
delete pak.ack_data
return resp_pak_id}function ackReadHeader(pak){var flags=pak.getFlags()
var msg=flags&ACKFLAG_IS_RESP?pak.readInt():pak.readAnsiString()
var pak_id=pak.readInt()
var err=flags&ACKFLAG_ERR?pak.readString():undefined
var data
if(flags&ACKFLAG_DATA_JSON){data=pak.readJSON()}else{data=pak}return{msg:msg,err:err,data:data,pak_id:pak_id}}function failAll(receiver,err){err=err||ERR_FAILALL_DISCONNECT
var cbs=receiver.resp_cbs
receiver.resp_cbs={}
receiver.responses_waiting=0
for(var pak_id in cbs){cbs[pak_id](err)}}function ackHandleMessage(receiver,source,pak,send_func,pak_func,handle_func,filter_func){var pak_initial_offs=pak.getOffset()
var _ackReadHeader=ackReadHeader(pak),err=_ackReadHeader.err,data=_ackReadHeader.data,msg=_ackReadHeader.msg,pak_id=_ackReadHeader.pak_id
if(receiver.logPacketDispatch){receiver.logPacketDispatch(source,pak,pak_initial_offs,msg)}var now=Date.now()
var expecting_response=Boolean(pak_id)
var timeout_id
if(expecting_response){timeout_id="pending"}var sent_response=false
var start_time=now
if(filter_func&&!filter_func(receiver,msg,data)){return}function preSendResp(err){assert(!sent_response,"Response function called twice")
sent_response=true
if(expecting_response){if(timeout_id){if(timeout_id!=="pending"){clearTimeout(timeout_id)}}else{if(err===ERR_FAILALL_DISCONNECT){}else{(receiver.log?receiver:console).log("Response finally sent for "+msg+" after "+((Date.now()-start_time)/1e3).toFixed(1)+"s")}}receiver.responses_waiting--}}function respFunc(err,resp_data,resp_func){preSendResp(err)
if(!expecting_response){if(resp_func){receiver.onError("Sending a response to a packet ("+msg+") that did not expect"+" one, but we are expecting a response")
return}if(err){send_func("error",null,err,null)}return}send_func(pak_id,err,resp_data,resp_func)}respFunc.expecting_response=expecting_response
respFunc.pak=function(ref_pak){assert(expecting_response)
var pak=pak_func(pak_id,ref_pak)
var orig_send=pak.send
pak.send=function(err,resp_func){preSendResp(err)
orig_send.call(pak,err,resp_func)}
return pak}
if(typeof msg==="number"){var cb=receiver.resp_cbs[msg]
if(!cb){return void receiver.onError("Received response to unknown packet with id "+msg+" from "+source)}delete receiver.resp_cbs[msg]
cb(err,data,respFunc)}else{if(!msg){return void receiver.onError("Received message with no .msg from "+source)}handle_func(msg,data,respFunc)}if(expecting_response){receiver.responses_waiting++
if(!sent_response&&!respFunc.suppress_timeout){timeout_id=setTimeout(function(){timeout_id=null
if(!respFunc.suppress_timeout){(receiver.log?receiver:console).log("Response not sent for "+msg+" from "+source+" after "+((Date.now()-start_time)/1e3).toFixed(1)+"s")}},15*1e3)}}}

},{"./packet.js":85,"assert":undefined}],77:[function(require,module,exports){
(function (Buffer){(function (){
"use strict"
var floor=Math.floor
var chr_table="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split("")
var PAD="="
function encode(dv,offset,length){var data=dv.u8
var result=""
var i
var effi
for(i=0;i<length-2;i+=3){effi=offset+i
result+=chr_table[data[effi]>>2]
result+=chr_table[((data[effi]&3)<<4)+(data[effi+1]>>4)]
result+=chr_table[((data[effi+1]&15)<<2)+(data[effi+2]>>6)]
result+=chr_table[data[effi+2]&63]}if(length%3){i=length-length%3
effi=offset+i
result+=chr_table[data[effi]>>2]
if(length%3===2){result+=chr_table[((data[effi]&3)<<4)+(data[effi+1]>>4)]
result+=chr_table[(data[effi+1]&15)<<2]
result+=PAD}else{result+=chr_table[(data[effi]&3)<<4]
result+=PAD+PAD}}return result}function decodeNativeBrowser(data,allocator){var str=window.atob(data)
var len=str.length
var dv=allocator(len)
var u8=dv.u8
for(var ii=0;ii<len;++ii){u8[ii]=str.charCodeAt(ii)}dv.decode_size=len
return dv}function encodeNativeNode(dv,offset,length){return Buffer.from(dv.buffer).toString("base64",offset,offset+length)}function decodeNativeNode(data,allocator){var buffer_len=(data.length>>2)*3+floor(data.length%4/1.5)
var dv=allocator(buffer_len)
var buffer=Buffer.from(dv.buffer)
dv.decode_size=buffer.write(data,"base64")
return dv}var BROWSER=typeof window!=="undefined"
exports.base64Decode=BROWSER?decodeNativeBrowser:decodeNativeNode
exports.base64Encode=BROWSER?encode:encodeNativeNode
exports.base64CharTable=chr_table

}).call(this)}).call(this,require("buffer").Buffer)

},{"buffer":undefined}],78:[function(require,module,exports){
"use strict"
exports.MAX_CLIENT_UPLOAD_SIZE=void 0
exports.chunkedReceiverCleanup=chunkedReceiverCleanup
exports.chunkedReceiverFinish=chunkedReceiverFinish
exports.chunkedReceiverFreeFile=chunkedReceiverFreeFile
exports.chunkedReceiverGetFile=chunkedReceiverGetFile
exports.chunkedReceiverInit=chunkedReceiverInit
exports.chunkedReceiverOnChunk=chunkedReceiverOnChunk
exports.chunkedReceiverStart=chunkedReceiverStart
exports.chunkedSend=chunkedSend
var assert=require("assert")
var _require=require("glov-async"),asyncParallelLimit=_require.asyncParallelLimit,asyncSeries=_require.asyncSeries
var crc32=require("./crc32.js")
var ceil=Math.ceil,min=Math.min
var _require2=require("./packet.js"),packetBufPoolAlloc=_require2.packetBufPoolAlloc,packetBufPoolFree=_require2.packetBufPoolFree
var MAX_CLIENT_UPLOAD_SIZE=2*1024*1024
exports.MAX_CLIENT_UPLOAD_SIZE=MAX_CLIENT_UPLOAD_SIZE
var CHUNK_SIZE=8192-100
function cleanupFile(state,file_id,pool){var file_data=state.files[file_id]
if(file_data.dv){packetBufPoolFree(file_data.dv)
delete file_data.dv}state.buffer_size-=file_data.length
assert(state.buffer_size>=0)
delete state.files[file_id]}function chunkedReceiverInit(name,max_buffer_size){return{name:name,max_buffer_size:max_buffer_size,last_file_id:0,buffer_size:0,files:{}}}function chunkedReceiverCleanup(state){if(!state||!state.files){return}for(var file_id in state.files){cleanupFile(state,file_id)}}function chunkedReceiverFreeFile(container){var buffer=container.buffer,dv=container.dv
assert(buffer)
assert(dv)
packetBufPoolFree(dv)
delete container.buffer}function chunkedReceiverGetFile(state,file_id){if(!state){return{err:"ERR_NOT_INITIALIZED"}}function err(msg){console.error(state.name+": chunkedReceiverGetFile("+file_id+"): "+msg)
return{err:msg}}if(!state.files){return err("ERR_FILE_NOT_FOUND")}var file_data=state.files[file_id]
if(!file_data){return err("ERR_FILE_NOT_FOUND")}if(!file_data.finished){cleanupFile(state,file_id)
return err("ERR_UPLOAD_UNFINISHED")}var dv=file_data.dv,mime_type=file_data.mime_type,length=file_data.length
file_data.buffer=null
file_data.dv=null
cleanupFile(state,file_id)
var buffer=new Uint8Array(dv.buffer,dv.byteOffset,length)
return{dv:dv,mime_type:mime_type,buffer:buffer}}function chunkedReceiverStart(state,pak,resp_func){assert(state)
var length=pak.readInt()
var crc=pak.readU32()
var mime_type=pak.readAnsiString()
var log=state.name+": chunkedReceiverStart length="+length+" crc="+crc+" mime="+mime_type
if(length>state.max_buffer_size){console.error(log+": ERR_TOO_LARGE")
return void resp_func("ERR_TOO_LARGE")}if(state.buffer_size+length>state.max_buffer_size){console.error(log+": ERR_OUT_OF_SPACE")
return void resp_func("ERR_OUT_OF_SPACE")}state.buffer_size+=length
var id=++state.last_file_id
console.log(log+" id="+id)
state.files[id]={length:length,crc:crc,mime_type:mime_type,total:0,dv:packetBufPoolAlloc(length)}
resp_func(null,id)}function chunkedReceiverOnChunk(state,pak,resp_func){if(!state){pak.pool()
return void resp_func("ERR_NOT_INITED")}var id=pak.readInt()
var offs=pak.readInt()
var buf=pak.readBuffer(false)
var log=state.name+": chunkedReceiverOnChunk id="+id+" offs="+offs+" length="+buf.length
var file_data=state.files&&state.files[id]
if(!file_data){console.error(log+": ERR_INVALID_FILE_ID")
return void resp_func("ERR_INVALID_FILE_ID")}if(file_data.total+buf.length>file_data.length){cleanupFile(state,id)
console.error(log+": ERR_BUFFER_OVERRUN")
return void resp_func("ERR_BUFFER_OVERRUN")}console.debug(log)
file_data.total+=buf.length
file_data.dv.u8.set(buf,offs)
if(state.on_progress){state.on_progress(file_data.total,file_data.length,file_data.mime_type,id)}resp_func()}function chunkedReceiverFinish(state,pak,resp_func){var id=pak.readInt()
if(!state){return void resp_func("ERR_NOT_INITED")}var file_data=state.files&&state.files[id]
var log=state.name+": chunkedReceiverFinish id="+id
if(!file_data){console.error(log+": ERR_INVALID_FILE_ID")
return void resp_func("ERR_INVALID_FILE_ID")}if(file_data.total!==file_data.length){cleanupFile(state,id)
console.error(log+": ERR_INCOMPLETE (total="+file_data.total+" length="+file_data.length+")")
return void resp_func("ERR_INCOMPLETE")}var crc=crc32(file_data.dv.u8,file_data.length)
if(crc!==file_data.crc){cleanupFile(state,id)
console.error(log+": ERR_CRC_MISMATCH (expected="+file_data.crc+" actual="+crc+")")
return void resp_func("ERR_CRC_MISMATCH")}file_data.finished=true
resp_func()}function chunkedSend(opts,cb){var client=opts.client,buffer=opts.buffer,mime_type=opts.mime_type,max_in_flight=opts.max_in_flight
assert(buffer instanceof Uint8Array,"Invalid data type")
assert(mime_type,"Missing mime_type")
var length=buffer.length
assert(length)
var crc=crc32(buffer)
var id
asyncSeries([function getID(next){var pak=client.pak("upload_start")
pak.writeInt(length)
pak.writeU32(crc)
pak.writeAnsiString(mime_type)
pak.send(function(err,assigned_id){id=assigned_id
next(err)})},function streamFile(next){var num_chunks=ceil(length/CHUNK_SIZE)
var any_error=false
function sendChunk(idx,next){if(any_error){return void next()}assert(idx<num_chunks)
var pak=client.pak("upload_chunk")
pak.writeInt(id)
var start=idx*CHUNK_SIZE
pak.writeInt(start)
var chunk_len=min(CHUNK_SIZE,length-start)
pak.writeBuffer(new Uint8Array(buffer.buffer,buffer.byteOffset+start,chunk_len))
pak.send(function(err){if(err){any_error=true}next(err)})}var tasks=[]
for(var ii=0;ii<num_chunks;++ii){tasks.push(sendChunk.bind(null,ii))}asyncParallelLimit(tasks,max_in_flight,next)},function finish(next){var pak=client.pak("upload_finish")
pak.writeInt(id)
pak.send(next)}],function(err){cb(err,id)})}

},{"./crc32.js":80,"./packet.js":85,"assert":undefined,"glov-async":undefined}],79:[function(require,module,exports){
"use strict"
exports.TYPE_STRING=exports.TYPE_INT=exports.TYPE_FLOAT=void 0
exports.canonical=canonical
exports.create=create
exports.defaultHandler=defaultHandler
var assert=require("assert")
var _require=require("./util.js"),isInteger=_require.isInteger
var _require2=require("./perfcounters.js"),perfCounterAdd=_require2.perfCounterAdd
function canonical(cmd){return cmd.toLowerCase().replace(/[_.]/g,"")}var TYPE_INT=0
exports.TYPE_INT=TYPE_INT
var TYPE_FLOAT=1
exports.TYPE_FLOAT=TYPE_FLOAT
var TYPE_STRING=2
exports.TYPE_STRING=TYPE_STRING
var TYPE_NAME=["INTEGER","NUMBER","STRING"]
function defaultHandler(err,resp){if(err){console.error(err,resp)}else{console.info(resp)}}function checkAccess(access,list){if(list){for(var ii=0;ii<list.length;++ii){if(!access||!access[list[ii]]){return false}}}return true}function formatUsage(usage,help,prefix_help){return!usage?undefined:prefix_help?help+"\n"+usage:help?String(usage).replace(/\$HELP/,help):String(usage)}function CmdParse(params){this.cmds={}
this.cmds_for_complete=this.cmds
this.was_not_found=false
this.storage=params&&params.storage
this.default_handler=defaultHandler
this.last_access=null
this.register({cmd:"cmd_list",func:this.cmdList.bind(this),access_show:["hidden"]})}CmdParse.prototype.cmdList=function(str,resp_func){if(!this.cmd_list){var list=this.cmd_list={}
for(var cmd in this.cmds){var cmd_data=this.cmds[cmd]
var access=[]
if(cmd_data.access_show){access=access.concat(cmd_data.access_show)}if(cmd_data.access_run){access=access.concat(cmd_data.access_run)}if(access.indexOf("hidden")!==-1){continue}var data={name:cmd_data.name,help:String(cmd_data.help)}
if(cmd_data.usage){data.usage=formatUsage(cmd_data.usage,cmd_data.help,cmd_data.prefix_usage_with_help)}if(access.length){data.access_show=access}list[cmd]=data}}resp_func(null,this.cmd_list)}
CmdParse.prototype.setDefaultHandler=function(fn){assert(this.default_handler===defaultHandler)
this.default_handler=fn}
CmdParse.prototype.checkAccess=function(access_list){return checkAccess(this.last_access,access_list)}
CmdParse.prototype.handle=function(self,str,resp_func){resp_func=resp_func||this.default_handler
this.was_not_found=false
var m=str.match(/^([^\s]+)(?:\s+(.*))?$/)
if(!m){resp_func("Missing command")
return true}var cmd=canonical(m[1])
var cmd_data=this.cmds[cmd]
this.last_access=self&&self.access
if(cmd_data&&!checkAccess(this.last_access,cmd_data.access_run)){resp_func('Access denied: "'+m[1]+'"')
return false}if(!cmd_data){this.was_not_found=true
resp_func('Unknown command: "'+m[1]+'"')
this.was_not_found=false
return false}perfCounterAdd("cmd."+cmd)
cmd_data.fn.call(self,m[2]||"",resp_func)
return true}
CmdParse.prototype.register=function(param){assert.equal(typeof param,"object")
var cmd=param.cmd,func=param.func,help=param.help,usage=param.usage,prefix_usage_with_help=param.prefix_usage_with_help,access_show=param.access_show,access_run=param.access_run
assert(cmd&&func)
var help_lower=String(help||"").toLowerCase()
if(help_lower.includes("(admin)")){assert(access_run&&access_run.includes("sysadmin"))}if(help_lower.includes("(hidden)")){assert(access_show&&access_show.length)}this.cmds[canonical(cmd)]={name:cmd,fn:func,help:help,usage:usage,prefix_usage_with_help:prefix_usage_with_help,access_show:access_show,access_run:access_run}}
function formatRangeValue(type,value){var ret=String(value)
if(type===TYPE_FLOAT&&!ret.includes(".")){ret+=".00"}return ret}CmdParse.prototype.registerValue=function(cmd,param){var _this=this
assert(TYPE_NAME[param.type]||!param.set)
assert(param.set||param.get)
var label=param.label||cmd
var store=param.store&&this.storage||false
var store_key="cmd_parse_"+canonical(cmd)
if(param.ver){store_key+="_"+param.ver}if(store){assert(param.set)
var init_value=this.storage.getJSON(store_key)
if(init_value!==undefined){if(param.range){init_value=Number(init_value)
if(!isFinite(init_value)||init_value<param.range[0]||init_value>param.range[1]){init_value=undefined}}if(init_value!==undefined){param.set(init_value)}if(param.on_change){param.on_change(true)}}}var fn=function fn(str,resp_func){function value(){resp_func(null,label+" = "+param.get())}function usage(){resp_func("Usage: /"+cmd+" "+TYPE_NAME[param.type])}if(!str){if(param.get&&param.set){var is_bool=param.type===TYPE_INT&&param.range&&param.range[0]===0&&param.range[1]===1
var help=[label+":"]
if(param.range){help.push("Valid range: ["+formatRangeValue(param.type,param.range[0])+"..."+(formatRangeValue(param.type,param.range[1])+"]"))}var cur_value=param.get()
if(is_bool){help.push("To disable: /"+cmd+" 0")
help.push("To enable: /"+cmd+" 1")}else{help.push("To change: /"+cmd+" NewValue")
help.push("  example: /"+cmd+" "+(param.range?cur_value===param.range[0]?param.range[1]:param.range[0]:1))}var def_value=param.default_value
if(def_value!==undefined){help.push("Default value = "+def_value+(is_bool?" ("+(def_value?"Enabled":"Disabled")+")":""))}help.push("Current value = "+cur_value+(is_bool?" ("+(cur_value?"Enabled":"Disabled")+")":""))
return resp_func(null,help.join("\n"))}else if(param.get){return value()}else{return usage()}}if(!param.set){return resp_func("Usage: /"+cmd)}var n=Number(str)
if(param.range){if(n<param.range[0]){n=param.range[0]}else if(n>param.range[1]){n=param.range[1]}}var store_value=n
if(param.type===TYPE_INT){if(!isInteger(n)){return usage()}param.set(n)}else if(param.type===TYPE_FLOAT){if(!isFinite(n)){return usage()}param.set(n)}else{store_value=str
param.set(str)}if(store){_this.storage.setJSON(store_key,store_value)}if(param.on_change){param.on_change(false)}if(param.get){return value()}else{return resp_func(null,label+" udpated")}}
this.register({cmd:cmd,func:fn,help:param.help||(param.get&&param.set?'Set or display "'+label+'" value':param.set?'Set "'+label+'" value':'Display "'+label+'" value'),usage:param.usage||(param.get?'Display "'+label+'" value\n  Usage: /'+cmd+"\n":"")+(param.set?'Set "'+label+'" value\n  Usage: /'+cmd+" NewValue":""),prefix_usage_with_help:param.prefix_usage_with_help,access_show:param.access_show,access_run:param.access_run})}
function cmpCmd(a,b){if(a.cname<b.cname){return-1}return 1}CmdParse.prototype.addServerCommands=function(new_cmds){var cmds=this.cmds_for_complete
if(this.cmds_for_complete===this.cmds){cmds=this.cmds_for_complete={}
for(var cname in this.cmds){cmds[cname]=this.cmds[cname]}}for(var _cname in new_cmds){if(!cmds[_cname]){cmds[_cname]=new_cmds[_cname]}}}
CmdParse.prototype.autoComplete=function(str,access){var list=[]
str=str.split(" ")
var first_tok=canonical(str[0])
for(var cname in this.cmds_for_complete){if(str.length===1&&cname.slice(0,first_tok.length)===first_tok||str.length>1&&cname===first_tok){var cmd_data=this.cmds_for_complete[cname]
if(checkAccess(access,cmd_data.access_show)&&checkAccess(access,cmd_data.access_run)){list.push({cname:cname,cmd:cmd_data.name,help:String(cmd_data.help),usage:formatUsage(cmd_data.usage,cmd_data.help,cmd_data.prefix_usage_with_help)})}}}list.sort(cmpCmd)
return list}
CmdParse.prototype.canonical=canonical
CmdParse.prototype.TYPE_INT=TYPE_INT
CmdParse.prototype.TYPE_FLOAT=TYPE_FLOAT
CmdParse.prototype.TYPE_STRING=TYPE_STRING
function create(params){return new CmdParse(params)}

},{"./perfcounters.js":86,"./util.js":89,"assert":undefined}],80:[function(require,module,exports){
"use strict"
var crc_table=new Array(256);(function(){for(var n=0;n<256;n++){var c=n
for(var k=0;k<8;k++){if(c&1){c=-306674912^c>>>1}else{c>>>=1}}crc_table[n]=c}})()
function update_crc(crc,buf,len){for(var n=0;n<len;n++){crc=crc_table[(crc^buf[n])&255]^crc>>>8}return crc}function crc32(buf,len){len=len||buf.length
return(update_crc(4294967295,buf,len)^4294967295)>>>0}module.exports=crc32
module.exports.crc32=crc32

},{}],81:[function(require,module,exports){
"use strict"
var _require=require("./util.js"),arrayToSet=_require.arrayToSet
var disallowedKeys=arrayToSet(["__proto__","prototype","constructor"])
function isObject(value){var type=typeof value
return value!==null&&(type==="object"||type==="function")}function isValidPath(pathSegments){for(var ii=0;ii<pathSegments.length;++ii){if(disallowedKeys[pathSegments[ii]]){return false}}return true}function getPathSegments(path){var pathArray=path.split(".")
var parts=[]
for(var i=0;i<pathArray.length;i++){var p=pathArray[i]
while(p[p.length-1]==="\\"&&pathArray[i+1]!==undefined){p=p.slice(0,-1)+"."
p+=pathArray[++i]}parts.push(p)}if(!isValidPath(parts)){return[]}return parts}module.exports={get:function get(object,path,value){if(!isObject(object)||typeof path!=="string"){return value===undefined?object:value}var pathArray=getPathSegments(path)
if(pathArray.length===0){return value}for(var i=0;i<pathArray.length;i++){object=object[pathArray[i]]
if(object===undefined||object===null){if(i!==pathArray.length-1){return value}break}}return object===undefined?value:object},set:function set(object,path,value){if(!isObject(object)||typeof path!=="string"){return object}var root=object
var pathArray=getPathSegments(path)
for(var i=0;i<pathArray.length;i++){var p=pathArray[i]
if(i===pathArray.length-1){object[p]=value}else if(!isObject(object[p])){object[p]={}}object=object[p]}return root},delete:function _delete(object,path){if(!isObject(object)||typeof path!=="string"){return false}var pathArray=getPathSegments(path)
for(var i=0;i<pathArray.length;i++){var p=pathArray[i]
if(i===pathArray.length-1){delete object[p]
return true}object=object[p]
if(!isObject(object)){return false}}},has:function has(object,path){if(!isObject(object)||typeof path!=="string"){return false}var pathArray=getPathSegments(path)
if(pathArray.length===0){return false}for(var i=0;i<pathArray.length;i++){if(isObject(object)){if(!(pathArray[i]in object)){return false}object=object[pathArray[i]]}else{return false}}return true}}

},{"./util.js":89}],82:[function(require,module,exports){
"use strict"
exports.Platform=exports.PRESENCE_OFFLINE=exports.PRESENCE_INACTIVE=exports.PRESENCE_ACTIVE=exports.ID_PROVIDER_FB_INSTANT=exports.ID_PROVIDER_FB_GAMING=exports.ID_PROVIDER_APPLE=void 0
exports.getPlatformValues=getPlatformValues
exports.isValidPlatform=isValidPlatform
var PRESENCE_OFFLINE=0
exports.PRESENCE_OFFLINE=PRESENCE_OFFLINE
var PRESENCE_ACTIVE=1
exports.PRESENCE_ACTIVE=PRESENCE_ACTIVE
var PRESENCE_INACTIVE=2
exports.PRESENCE_INACTIVE=PRESENCE_INACTIVE
var ID_PROVIDER_APPLE="apl"
exports.ID_PROVIDER_APPLE=ID_PROVIDER_APPLE
var ID_PROVIDER_FB_GAMING="fbg"
exports.ID_PROVIDER_FB_GAMING=ID_PROVIDER_FB_GAMING
var ID_PROVIDER_FB_INSTANT="fbi"
exports.ID_PROVIDER_FB_INSTANT=ID_PROVIDER_FB_INSTANT
function getStringEnumValues(e){return Object.values(e)}function isValidStringEnumValue(e,v){for(var key in e){if(e[key]===v){return true}}return false}var Platform
exports.Platform=Platform;(function(Platform){Platform["Android"]="android"
Platform["FBInstant"]="fbinstant"
Platform["IOS"]="ios"
Platform["Web"]="web"
Platform["Yandex"]="yandex"})(Platform||(exports.Platform=Platform={}))
function getPlatformValues(){return getStringEnumValues(Platform)}function isValidPlatform(v){return isValidStringEnumValue(Platform,v)}

},{}],83:[function(require,module,exports){
"use strict"
exports.FriendStatus=void 0
var FriendStatus
exports.FriendStatus=FriendStatus;(function(FriendStatus){FriendStatus[FriendStatus["Added"]=1]="Added"
FriendStatus[FriendStatus["AddedAuto"]=2]="AddedAuto"
FriendStatus[FriendStatus["Removed"]=3]="Removed"
FriendStatus[FriendStatus["Blocked"]=4]="Blocked"})(FriendStatus||(exports.FriendStatus=FriendStatus={}))

},{}],84:[function(require,module,exports){
"use strict"
var assert=require("assert")
function stringUtf8Encode(str){var c
var n
var utftext=[]
str=str.replace(/\r\n/g,"\n")
for(n=0;n<str.length;++n){c=str.charCodeAt(n)
if(c<128){utftext.push(String.fromCharCode(c))}else if(c>127&&c<2048){utftext.push(String.fromCharCode(c>>6|192))
utftext.push(String.fromCharCode(c&63|128))}else{utftext.push(String.fromCharCode(c>>12|224))
utftext.push(String.fromCharCode(c>>6&63|128))
utftext.push(String.fromCharCode(c&63|128))}}return utftext.join("")}function rotateLeft(lValue,iShiftBits){return lValue<<iShiftBits|lValue>>>32-iShiftBits}function addUnsigned(lX,lY){var lX8=lX&2147483648
var lY8=lY&2147483648
var lX4=lX&1073741824
var lY4=lY&1073741824
var lResult=(lX&1073741823)+(lY&1073741823)
if(lX4&lY4){return lResult^2147483648^lX8^lY8}if(lX4|lY4){if(lResult&1073741824){return lResult^3221225472^lX8^lY8}else{return lResult^1073741824^lX8^lY8}}else{return lResult^lX8^lY8}}function F(x,y,z){return x&y|~x&z}function G(x,y,z){return x&z|y&~z}function H(x,y,z){return x^y^z}function I(x,y,z){return y^(x|~z)}function FF(a,b,c,d,x,s,ac){a=addUnsigned(a,addUnsigned(addUnsigned(F(b,c,d),x),ac))
return addUnsigned(rotateLeft(a,s),b)}function GG(a,b,c,d,x,s,ac){a=addUnsigned(a,addUnsigned(addUnsigned(G(b,c,d),x),ac))
return addUnsigned(rotateLeft(a,s),b)}function HH(a,b,c,d,x,s,ac){a=addUnsigned(a,addUnsigned(addUnsigned(H(b,c,d),x),ac))
return addUnsigned(rotateLeft(a,s),b)}function II(a,b,c,d,x,s,ac){a=addUnsigned(a,addUnsigned(addUnsigned(I(b,c,d),x),ac))
return addUnsigned(rotateLeft(a,s),b)}function convertToWordArray(string){var lWordCount
var lMessageLength=string.length
var lNumberOfWords_temp1=lMessageLength+8
var lNumberOfWords_temp2=(lNumberOfWords_temp1-lNumberOfWords_temp1%64)/64
var lNumberOfWords=(lNumberOfWords_temp2+1)*16
var lWordArray=new Array(lNumberOfWords-1)
var lBytePosition=0
var lByteCount=0
while(lByteCount<lMessageLength){lWordCount=(lByteCount-lByteCount%4)/4
lBytePosition=lByteCount%4*8
lWordArray[lWordCount]|=string.charCodeAt(lByteCount)<<lBytePosition
lByteCount++}lWordCount=(lByteCount-lByteCount%4)/4
lBytePosition=lByteCount%4*8
lWordArray[lWordCount]|=128<<lBytePosition
lWordArray[lNumberOfWords-2]=lMessageLength<<3
lWordArray[lNumberOfWords-1]=lMessageLength>>>29
return lWordArray}function wordToHex(lValue){var wordToHexValue=""
var wordToHexValue_temp=""
var lByte
var lCount
for(lCount=0;lCount<=3;lCount++){lByte=lValue>>>lCount*8&255
wordToHexValue_temp="0"+lByte.toString(16)
wordToHexValue+=wordToHexValue_temp.substr(wordToHexValue_temp.length-2,2)}return wordToHexValue}module.exports=function md5(string){var AA
var BB
var CC
var DD
var a
var b
var c
var d
var k
var S11=7
var S12=12
var S13=17
var S14=22
var S21=5
var S22=9
var S23=14
var S24=20
var S31=4
var S32=11
var S33=16
var S34=23
var S41=6
var S42=10
var S43=15
var S44=21
var x
if(typeof string==="string"){string=stringUtf8Encode(string)
x=convertToWordArray(string)}else{assert(false)}a=1732584193
b=4023233417
c=2562383102
d=271733878
for(k=0;k<x.length;k+=16){AA=a
BB=b
CC=c
DD=d
a=FF(a,b,c,d,x[k],S11,3614090360)
d=FF(d,a,b,c,x[k+1],S12,3905402710)
c=FF(c,d,a,b,x[k+2],S13,606105819)
b=FF(b,c,d,a,x[k+3],S14,3250441966)
a=FF(a,b,c,d,x[k+4],S11,4118548399)
d=FF(d,a,b,c,x[k+5],S12,1200080426)
c=FF(c,d,a,b,x[k+6],S13,2821735955)
b=FF(b,c,d,a,x[k+7],S14,4249261313)
a=FF(a,b,c,d,x[k+8],S11,1770035416)
d=FF(d,a,b,c,x[k+9],S12,2336552879)
c=FF(c,d,a,b,x[k+10],S13,4294925233)
b=FF(b,c,d,a,x[k+11],S14,2304563134)
a=FF(a,b,c,d,x[k+12],S11,1804603682)
d=FF(d,a,b,c,x[k+13],S12,4254626195)
c=FF(c,d,a,b,x[k+14],S13,2792965006)
b=FF(b,c,d,a,x[k+15],S14,1236535329)
a=GG(a,b,c,d,x[k+1],S21,4129170786)
d=GG(d,a,b,c,x[k+6],S22,3225465664)
c=GG(c,d,a,b,x[k+11],S23,643717713)
b=GG(b,c,d,a,x[k],S24,3921069994)
a=GG(a,b,c,d,x[k+5],S21,3593408605)
d=GG(d,a,b,c,x[k+10],S22,38016083)
c=GG(c,d,a,b,x[k+15],S23,3634488961)
b=GG(b,c,d,a,x[k+4],S24,3889429448)
a=GG(a,b,c,d,x[k+9],S21,568446438)
d=GG(d,a,b,c,x[k+14],S22,3275163606)
c=GG(c,d,a,b,x[k+3],S23,4107603335)
b=GG(b,c,d,a,x[k+8],S24,1163531501)
a=GG(a,b,c,d,x[k+13],S21,2850285829)
d=GG(d,a,b,c,x[k+2],S22,4243563512)
c=GG(c,d,a,b,x[k+7],S23,1735328473)
b=GG(b,c,d,a,x[k+12],S24,2368359562)
a=HH(a,b,c,d,x[k+5],S31,4294588738)
d=HH(d,a,b,c,x[k+8],S32,2272392833)
c=HH(c,d,a,b,x[k+11],S33,1839030562)
b=HH(b,c,d,a,x[k+14],S34,4259657740)
a=HH(a,b,c,d,x[k+1],S31,2763975236)
d=HH(d,a,b,c,x[k+4],S32,1272893353)
c=HH(c,d,a,b,x[k+7],S33,4139469664)
b=HH(b,c,d,a,x[k+10],S34,3200236656)
a=HH(a,b,c,d,x[k+13],S31,681279174)
d=HH(d,a,b,c,x[k],S32,3936430074)
c=HH(c,d,a,b,x[k+3],S33,3572445317)
b=HH(b,c,d,a,x[k+6],S34,76029189)
a=HH(a,b,c,d,x[k+9],S31,3654602809)
d=HH(d,a,b,c,x[k+12],S32,3873151461)
c=HH(c,d,a,b,x[k+15],S33,530742520)
b=HH(b,c,d,a,x[k+2],S34,3299628645)
a=II(a,b,c,d,x[k],S41,4096336452)
d=II(d,a,b,c,x[k+7],S42,1126891415)
c=II(c,d,a,b,x[k+14],S43,2878612391)
b=II(b,c,d,a,x[k+5],S44,4237533241)
a=II(a,b,c,d,x[k+12],S41,1700485571)
d=II(d,a,b,c,x[k+3],S42,2399980690)
c=II(c,d,a,b,x[k+10],S43,4293915773)
b=II(b,c,d,a,x[k+1],S44,2240044497)
a=II(a,b,c,d,x[k+8],S41,1873313359)
d=II(d,a,b,c,x[k+15],S42,4264355552)
c=II(c,d,a,b,x[k+6],S43,2734768916)
b=II(b,c,d,a,x[k+13],S44,1309151649)
a=II(a,b,c,d,x[k+4],S41,4149444226)
d=II(d,a,b,c,x[k+11],S42,3174756917)
c=II(c,d,a,b,x[k+2],S43,718787259)
b=II(b,c,d,a,x[k+9],S44,3951481745)
a=addUnsigned(a,AA)
b=addUnsigned(b,BB)
c=addUnsigned(c,CC)
d=addUnsigned(d,DD)}var temp=wordToHex(a)+wordToHex(b)+wordToHex(c)+wordToHex(d)
return temp.toLowerCase()}

},{"assert":undefined}],85:[function(require,module,exports){
(function (Buffer){(function (){
"use strict"
exports.packetBufPoolAlloc=packetBufPoolAlloc
exports.packetBufPoolFree=packetBufPoolFree
var PACKET_DEBUG=exports.PACKET_DEBUG=1<<0
var PACKET_RESERVED1=exports.PACKET_RESERVED1=1<<1
var PACKET_RESERVED2=exports.PACKET_RESERVED2=1<<2
var FLAG_PACKET_INTERNAL=PACKET_DEBUG|PACKET_RESERVED1|PACKET_RESERVED2
var PACKET_UNOWNED_BUFFER=1<<8
exports.default_flags=0
var assert=require("assert")
var max=Math.max
var _require=require("./util.js"),isInteger=_require.isInteger,log2=_require.log2
var _require2=require("./base64.js"),base64Encode=_require2.base64Encode,base64Decode=_require2.base64Decode
var FALSYS=[undefined,null,0,false,"",NaN]
var PAK_BUF_DEFAULT_SIZE=1024
var UNDERRUN="PKTERR_UNDERRUN"
var POOL_PACKETS=5e3
var POOL_TIMEOUT=5e3
var POOL_BUF_BY_SIZE=[0,10,10,20,20,20,20,20,20,20,5e3,20,20,20,20,20,20,10,10]
var pak_pool=[]
var pak_debug_pool=[]
var buf_pool=POOL_BUF_BY_SIZE.map(function(){return[]})
function allocDataView(size){var pool_idx=log2(size)
assert(pool_idx)
if(pool_idx>=buf_pool.length){pool_idx=0}if(pool_idx){size=1<<pool_idx
if(buf_pool[pool_idx].length){return buf_pool[pool_idx].pop()}}else{}var u8=new Uint8Array(size)
var dv=new DataView(u8.buffer)
dv.u8=u8
if(pool_idx){dv.packet_pool_idx=pool_idx}return dv}function wrapU8AsDataView(u8){var dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength)
dv.u8=u8
return dv}function utf8ByteLength(str){var len=str.length
var ret=len
for(var ii=0;ii<len;++ii){var c=str.charCodeAt(ii)
if(c>127){++ret
if(c>2047){++ret
if(c>65535){++ret
if(c>2097151){++ret
if(c>67108863){++ret}}}}}}return ret}function utf8WriteChar(buf,buf_offs,c){if(c>1114111){c=65535}if(c<=127){buf.u8[buf_offs++]=c}else if(c<=2047){buf.u8[buf_offs++]=c>>6|192
buf.u8[buf_offs++]=c&63|128}else if(c<=65535){buf.u8[buf_offs++]=c>>12|224
buf.u8[buf_offs++]=c>>6&63|128
buf.u8[buf_offs++]=c&63|128}else if(c<=1114111){buf.u8[buf_offs++]=c>>18|240
buf.u8[buf_offs++]=c>>12&63|128
buf.u8[buf_offs++]=c>>6&63|128
buf.u8[buf_offs++]=c&63|128}else{assert(false)}return buf_offs}function poolBuf(dv){assert(dv)
assert(dv.u8)
var pool_idx=dv.packet_pool_idx
if(pool_idx){var arr=buf_pool[pool_idx]
if(arr.length<POOL_BUF_BY_SIZE[pool_idx]){arr.push(dv)}}else{}}function packetBufPoolAlloc(size){return allocDataView(size)}function packetBufPoolFree(dv){poolBuf(dv)}function Packet(flags,init_size,pak_debug){this.reinit(flags,init_size,pak_debug)}Packet.prototype.reinit=function(flags,init_size,pak_debug){this.flags=flags||0
this.has_flags=false
this.buf=null
this.buf_len=0
this.buf_offs=0
this.bufs=null
this.bsizes=null
this.readable=false
this.ref_count=1
this.pak_debug=pak_debug
if(init_size){this.fit(init_size,true)
this.buf_len=init_size}}
Packet.prototype.getRefCount=function(){return this.ref_count}
Packet.prototype.ref=function(){assert(this.ref_count);++this.ref_count}
Packet.prototype.pool=function(){assert(this.ref_count)
if(--this.ref_count){return}if(this.flags&PACKET_UNOWNED_BUFFER){}else{if(this.buf){poolBuf(this.buf)}if(this.bufs){for(var ii=0;ii<this.bufs.length;++ii){poolBuf(this.bufs[ii])}}}if(pak_pool.length<POOL_PACKETS){pak_pool.push(this)}if(this.pak_debug){this.pak_debug.poolDebug()}}
Packet.prototype.totalSize=function(){var ret=0
if(this.readable){return this.buf_len}if(this.bsizes){for(var ii=0;ii<this.bsizes.length;++ii){ret+=this.bsizes[ii]}}ret+=this.buf_offs
return ret}
Packet.prototype.setReadable=function(){assert(this.buf)
assert(!this.bufs)
assert(!this.readable)
this.readable=true}
Packet.prototype.makeReadable=function(){assert(this.buf)
assert(!this.readable)
var total=this.totalSize()
this.readable=true
if(!this.bufs){this.buf_len=total
this.buf_offs=0
return}var buf=allocDataView(total)
var u8=buf.u8
var offs=0
for(var ii=0;ii<this.bufs.length;++ii){var bsize=this.bsizes[ii]
var dv=this.bufs[ii]
if(offs+dv.u8.length>total){assert.equal(dv.byteOffset,0)
u8.set(new Uint8Array(dv.buffer,0,bsize),offs)}else{u8.set(dv.u8,offs)}offs+=bsize
poolBuf(dv)}assert.equal(this.buf.byteOffset,0)
u8.set(new Uint8Array(this.buf.buffer,this.buf.byteOffset,this.buf_offs),offs)
poolBuf(this.buf)
assert.equal(offs+this.buf_offs,total)
this.bufs=this.bsizes=null
this.buf=buf
this.buf_offs=0
this.buf_len=total}
Packet.prototype.flush=function(){var buf=this.buf,buf_offs=this.buf_offs
if(!this.bufs){this.bufs=[buf]
this.bsizes=[buf_offs]}else{this.bufs.push(buf)
this.bsizes.push(buf_offs)}this.buf=null
this.buf_len=0
this.buf_offs=0}
Packet.prototype.fit=function(extra_bytes,no_advance){var buf=this.buf,buf_len=this.buf_len,buf_offs=this.buf_offs
var new_offs=buf_offs+extra_bytes
if(new_offs<=buf_len){if(!no_advance){this.buf_offs=new_offs}return buf_offs}assert(!this.readable)
if(buf){this.flush()}this.buf_len=buf_len=max(PAK_BUF_DEFAULT_SIZE,extra_bytes)
this.buf=allocDataView(buf_len)
this.buf_offs=no_advance?0:extra_bytes
return 0}
Packet.prototype.advance=function(bytes){var offs=this.buf_offs
var new_offs=offs+bytes
this.buf_offs=new_offs
if(new_offs>this.buf_len){throw new Error(UNDERRUN)}if(new_offs===this.buf_len){this.pool()}return offs}
Packet.prototype.ended=function(){return this.buf_offs===this.buf_len}
Packet.prototype.writeU8=function(v){assert(v>=0&&v<256)
var offs=this.fit(1)
this.buf.u8[offs]=v}
Packet.prototype.readU8=function(){return this.buf.u8[this.advance(1)]}
Packet.prototype.writeInt=function(v){assert(isInteger(v))
var offs=this.fit(9,true)
var buf=this.buf
var neg=v<0?1:0
if(neg){v=-v}if(v<248){if(neg){buf.u8[offs++]=255}buf.u8[offs++]=v}else{if(v<65536){buf.u8[offs++]=248+neg
buf.setUint16(offs,v,true)
offs+=2}else if(v<4294967296){buf.u8[offs++]=250+neg
buf.setUint32(offs,v,true)
offs+=4}else{buf.u8[offs++]=252+neg
var low_bits=v>>>0
buf.setUint32(offs,low_bits,true)
offs+=4
buf.setUint32(offs,(v-low_bits)/4294967296,true)
offs+=4}}this.buf_offs=offs}
Packet.prototype.zeroInt=function(){var b1=this.buf.u8[this.buf_offs]
if(b1<248){this.buf.u8[this.buf_offs++]=0
return}this.buf_offs++
var zeroes
switch(b1){case 253:case 252:zeroes=8
break
case 251:case 250:zeroes=4
break
case 249:case 248:zeroes=2
break
case 255:zeroes=1
break
default:throw new Error("PKTERR_PACKED_INT")}while(zeroes){--zeroes
this.buf.u8[this.buf_offs++]=0}}
Packet.prototype.readInt=function(){var b1=this.buf.u8[this.advance(1)]
if(b1<248){return b1}var sign=1
switch(b1){case 249:sign=-1
case 248:return sign*this.buf.getUint16(this.advance(2),true)
case 251:sign=-1
case 250:return sign*this.buf.getUint32(this.advance(4),true)
case 253:sign=-1
case 252:{var low_bits=this.buf.getUint32(this.advance(4),true)
var high_bits=this.buf.getUint32(this.advance(4),true)
return sign*(high_bits*4294967296+low_bits)}case 255:return-this.buf.u8[this.advance(1)]
default:throw new Error("PKTERR_PACKED_INT")}}
Packet.prototype.writeFloat=function(v){assert.equal(typeof v,"number")
if(!v){this.buf.u8[this.fit(1)]=0
return}var offs=this.fit(5,true)
this.buf.setFloat32(offs,v,true)
if(this.buf.u8[offs]<=1){this.buf.u8[offs++]=1
this.buf.setFloat32(offs,v,true)}this.buf_offs=offs+4}
Packet.prototype.readFloat=function(){var offs=this.advance(1)
var b1=this.buf.u8[offs]
if(!b1){return 0}if(b1===1){return this.buf.getFloat32(this.advance(4),true)}this.advance(3)
return this.buf.getFloat32(offs,true)}
Packet.prototype.writeU32=function(v){assert.equal(typeof v,"number")
this.buf.setUint32(this.fit(4),v,true)}
Packet.prototype.readU32=function(){return this.buf.getUint32(this.advance(4),true)}
Packet.prototype.writeString=function(v){assert.equal(typeof v,"string")
var byte_length=utf8ByteLength(v)
this.writeInt(byte_length)
if(!byte_length){return}var offs=this.fit(byte_length)
var buf=this.buf
for(var ii=0;ii<v.length;++ii){var c=v.charCodeAt(ii)
if(c<=127){buf.u8[offs++]=c}else{offs=utf8WriteChar(buf,offs,c)}}}
Packet.prototype.utf8ReadChar=function(c){var buf=this.buf
if(c>=192&&c<224){return(c&31)<<6|buf.u8[this.buf_offs++]&63}else if(c>=224&&c<240){return(c&15)<<12|(buf.u8[this.buf_offs++]&63)<<6|buf.u8[this.buf_offs++]&63}else if(c>=240&&c<248){return(c&15)<<18|(buf.u8[this.buf_offs++]&63)<<12|(buf.u8[this.buf_offs++]&63)<<6|buf.u8[this.buf_offs++]&63}else{return 65533}}
var string_assembly=[]
Packet.prototype.readString=function(){var byte_length=this.readInt()
if(!byte_length){return""}if(this.buf_offs+byte_length>this.buf_len){throw new Error(UNDERRUN)}var buf=this.buf
var end_offset=this.buf_offs+byte_length
var ret
if(byte_length>8192){ret=""
while(this.buf_offs<end_offset){var c=buf.u8[this.buf_offs++]
if(c>127){c=this.utf8ReadChar(c)}ret+=String.fromCharCode(c)}}else{string_assembly.length=byte_length
var ii=0
while(this.buf_offs<end_offset){var _c=buf.u8[this.buf_offs++]
if(_c>127){_c=this.utf8ReadChar(_c)}string_assembly[ii++]=_c}if(string_assembly.length!==ii){string_assembly.length=ii}ret=String.fromCharCode.apply(undefined,string_assembly)}if(this.buf_offs===this.buf_len){this.pool()}return ret}
Packet.prototype.writeAnsiString=function(v){assert.equal(typeof v,"string")
var byte_length=v.length
this.writeInt(byte_length)
var offs=this.fit(byte_length)
var buf=this.buf
for(var ii=0;ii<byte_length;++ii){buf.u8[offs++]=v.charCodeAt(ii)}}
Packet.prototype.readAnsiString=function(){var len=this.readInt()
if(!len){return""}var offs=this.advance(len)
var buf=this.buf
string_assembly.length=len
for(var ii=0;ii<len;++ii){string_assembly[ii]=buf.u8[offs++]}return String.fromCharCode.apply(undefined,string_assembly)}
Packet.prototype.writeJSON=function(v){if(!v){var idx=FALSYS.indexOf(v)
assert(idx!==-1)
this.writeU8(idx+1)
return}this.writeU8(0)
this.writeString(JSON.stringify(v))}
Packet.prototype.readJSON=function(){var byte=this.readU8()
if(byte){if(byte-1>=FALSYS.length){throw new Error("PKTERR_JSON_HEADER")}return FALSYS[byte-1]}var str=this.readString()
return JSON.parse(str)}
Packet.prototype.writeBuffer=function(v){this.writeInt(v.length)
if(v.length){var offs=this.fit(v.length)
this.buf.u8.set(v,offs)}}
var null_buf=new Uint8Array(0)
Packet.prototype.readBuffer=function(do_copy){var len=this.readInt()
if(!len){return null_buf}var offs=this.advance(len)
if(do_copy){return this.buf.u8.slice(offs,offs+len)}else{var buf=this.buf
return new Uint8Array(buf.buffer,buf.byteOffset+offs,len)}}
Packet.prototype.writeBool=function(v){this.writeU8(v?1:0)}
Packet.prototype.readBool=function(){return Boolean(this.readU8())}
Packet.prototype.append=function(pak){assert.equal(this.flags&FLAG_PACKET_INTERNAL,pak.flags&FLAG_PACKET_INTERNAL)
if(pak.bufs){for(var ii=0;ii<pak.bufs.length;++ii){var buf=pak.bufs[ii]
var bsize=pak.bsizes[ii]
var offs=this.fit(bsize)
if(bsize!==buf.byteLength){this.buf.u8.set(new Uint8Array(buf.buffer,buf.byteOffset,bsize),offs)}else{this.buf.u8.set(buf.u8,offs)}}}if(pak.buf){var _buf=pak.buf
var _bsize=pak.readable?pak.buf_len:pak.buf_offs
var _offs=this.fit(_bsize)
if(_bsize!==_buf.byteLength){this.buf.u8.set(new Uint8Array(_buf.buffer,_buf.byteOffset,_bsize),_offs)}else{this.buf.u8.set(_buf.u8,_offs)}}}
Packet.prototype.appendRemaining=function(pak){assert.equal(this.flags&FLAG_PACKET_INTERNAL,pak.flags&FLAG_PACKET_INTERNAL)
assert(pak.readable)
assert(!pak.bufs)
assert(pak.buf)
assert(pak.buf_offs<=pak.buf_len)
var bsize=pak.buf_len-pak.buf_offs
if(bsize){var offs=this.fit(bsize)
this.buf.u8.set(new Uint8Array(pak.buf.buffer,pak.buf.byteOffset+pak.buf_offs,bsize),offs)}pak.pool()}
Packet.prototype.toJSON=function(){var ret={f:this.flags}
if(this.bufs){ret.b=[]
for(var ii=0;ii<this.bufs.length;++ii){ret.b.push(base64Encode(this.bufs[ii],0,this.bsizes[ii]))}}if(this.buf){if(this.readable){ret.d=base64Encode(this.buf,0,this.buf_len)}else{ret.d=base64Encode(this.buf,0,this.buf_offs)}}return ret}
Packet.prototype.setBuffer=function(buf,buf_len){assert(!this.buf)
assert(!this.bufs)
assert(this.flags&PACKET_UNOWNED_BUFFER)
assert(buf instanceof Uint8Array)
this.buf=wrapU8AsDataView(buf)
this.buf_len=buf_len
this.readable=true}
Packet.prototype.getBuffer=function(){assert(this.buf)
assert(!this.bufs)
return this.buf.u8}
Packet.prototype.getBufferLen=function(){assert(this.buf)
assert(!this.bufs)
return this.readable?this.buf_len:this.buf_offs}
Packet.prototype.getOffset=function(){if(this.readable){return this.buf_offs}return this.totalSize()}
Packet.prototype.seek=function(pos){assert(this.readable)
assert(pos>=0&&pos<=this.buf_len)
this.buf_offs=pos}
Packet.prototype.writeFlags=function(){assert(!this.has_flags)
assert.equal(this.buf_offs,0)
this.writeU8(this.flags)
this.has_flags=true}
Packet.prototype.updateFlags=function(flags){assert(this.has_flags)
assert(!(flags&FLAG_PACKET_INTERNAL))
this.flags=this.flags&FLAG_PACKET_INTERNAL|flags
var buf=this.bufs?this.bufs[0]:this.buf
buf.u8[0]=this.flags}
Packet.prototype.readFlags=function(){var read=this.readU8()
assert.equal(read,this.flags&255)
this.has_flags=true
return this.flags}
Packet.prototype.getFlags=function(){return this.flags}
Packet.prototype.getInternalFlags=function(){return this.flags&FLAG_PACKET_INTERNAL}
Packet.prototype.contents=function(){return"pak("+this.totalSize()+"b)"}
function PacketDebug(flags,init_size){this.reinit(flags,init_size)}PacketDebug.prototype.reinit=function(flags,init_size){var _this=this
this.in_pool=false
if(pak_pool.length){this.pak=pak_pool.pop()
this.pak.reinit(flags,init_size,this)}else{this.pak=new Packet(flags,init_size,this)}this.warned=false
this.pool_timer=setTimeout(function(){console.warn("Packet not pooled after 5s: "+_this.contents())
_this.warned=true},POOL_TIMEOUT)}
PacketDebug.prototype.poolDebug=function(){if(this.warned){console.warn("Packet pooled after timeout")}else{clearTimeout(this.pool_timer)}assert(!this.in_pool)
this.in_pool=true
if(pak_debug_pool.length<POOL_PACKETS){pak_debug_pool.push(this)}}
var types=[null,"U8","U32","Int","Float","String","AnsiString","JSON","Bool","Buffer"]
types.forEach(function(type,idx){if(!type){return}var write="write"+type
var read="read"+type
var write_fn=Packet.prototype[write]
var read_fn=Packet.prototype[read]
PacketDebug.prototype[write]=function(v){this.pak.writeU8(idx)
write_fn.call(this.pak,v)}
PacketDebug.prototype[read]=function(param){var found_idx=this.pak.readU8()
if(found_idx!==idx){assert(false,"PacketDebug error: Expected "+type+"("+idx+"), found "+types[found_idx]+"("+found_idx+")")}return read_fn.call(this.pak,param)}})
PacketDebug.prototype.zeroInt=function(){this.pak.writeU8(3)
this.pak.zeroInt()};["ended","getBuffer","getBufferLen","getFlags","getInternalFlags","getOffset","getRefCount","makeReadable","pool","readFlags","ref","seek","setBuffer","setReadable","toJSON","totalSize","updateFlags","writeFlags"].forEach(function(fname){var fn=Packet.prototype[fname]
PacketDebug.prototype[fname]=function(){return fn.apply(this.pak,arguments)}})
PacketDebug.prototype.append=function(pak){assert(pak instanceof PacketDebug)
this.pak.append(pak.pak)}
PacketDebug.prototype.appendRemaining=function(pak){assert(pak instanceof PacketDebug)
this.pak.appendRemaining(pak.pak)}
function format(v){switch(typeof v){case"object":if(v instanceof Uint8Array){return"u8<"+v.length+">"}return JSON.stringify(v)
default:return v}}PacketDebug.prototype.contents=function(){var pak=this.pak
var cur_offs=pak.getOffset()
var read_len=cur_offs
var ret=["buf:"+pak.buf_offs+"/"+pak.buf_len]
if(pak.bufs){pak.makeReadable()
ret.push("bufs")}else if(pak.buf){if(pak.readable){read_len=pak.buf_len}pak.buf_offs=0}else{ret.push("empty")
read_len=-1}var saved_ref_count=pak.ref_count
pak.ref_count=2
try{if(!saved_ref_count){ret.push("!ref_count=0!")}if(pak.has_flags){ret.push("flags:"+pak.readU8())}while(pak.buf_offs<read_len){var type_idx=pak.readU8()
var type=types[type_idx]
if(!type){ret.push("UnknownType:"+type_idx)
break}var val=pak["read"+type]()
ret.push(type+":"+format(val))}}catch(e){ret.push("Error dumping packet contents: "+e)}pak.ref_count=saved_ref_count
pak.buf_offs=cur_offs
return ret.join(",")}
function packetCreate(flags,init_size){if(flags===undefined){flags=exports.default_flags}var pool=flags&PACKET_DEBUG?pak_debug_pool:pak_pool
if(pool.length){var pak=pool.pop()
pak.reinit(flags,init_size)
return pak}if(flags&PACKET_DEBUG){return new PacketDebug(flags,init_size)}return new Packet(flags,init_size)}exports.packetCreate=packetCreate
function packetFromBuffer(buf,buf_len,need_copy){var flags=buf[0]
assert.equal(typeof flags,"number")
if(need_copy){assert(buf_len)
assert(buf.buffer instanceof ArrayBuffer)
var pak=packetCreate(flags,buf_len)
if(buf.byteLength!==buf_len){buf=Buffer.from(buf.buffer,0,buf_len)}pak.getBuffer().set(buf)
pak.setReadable()
return pak}else{assert(buf instanceof Uint8Array)
var _pak=packetCreate(flags|PACKET_UNOWNED_BUFFER)
_pak.setBuffer(buf,buf_len||buf.byteLength)
return _pak}}exports.packetFromBuffer=packetFromBuffer
function packetFromJSON(js_obj){var pak=packetCreate(js_obj.f)
var payload=pak.pak||pak
function decode(str){return base64Decode(str,allocDataView)}if(js_obj.b){payload.bsizes=[]
payload.bufs=[]
for(var ii=0;ii<js_obj.b.length;++ii){var buf=decode(js_obj.b[ii])
payload.bufs.push(buf)
payload.bsizes.push(buf.decode_size)
delete buf.decode_size}}if(js_obj.d){payload.buf=decode(js_obj.d)
payload.buf_len=payload.buf.decode_size
delete payload.buf.decode_size
payload.buf_offs=0}return pak}exports.packetFromJSON=packetFromJSON
function isPacket(thing){return thing instanceof Packet||thing instanceof PacketDebug}exports.isPacket=isPacket

}).call(this)}).call(this,require("buffer").Buffer)

},{"./base64.js":77,"./util.js":89,"assert":undefined,"buffer":undefined}],86:[function(require,module,exports){
"use strict"
exports.perfCounterAdd=perfCounterAdd
exports.perfCounterHistory=perfCounterHistory
exports.perfCounterTick=perfCounterTick
var BUCKET_TIME=1e4
var NUM_BUCKETS=5
var counters={time_start:Date.now()}
var hist=[counters]
var countdown=BUCKET_TIME
function perfCounterAdd(key){counters[key]=(counters[key]||0)+1}function perfCounterTick(dt,log){countdown-=dt
if(countdown<=0){countdown=BUCKET_TIME
if(hist.length===NUM_BUCKETS){hist.splice(0,1)}var now=Date.now()
counters.time_end=now
if(log){log(counters)}counters={}
counters.time_start=now
hist.push(counters)}}function perfCounterHistory(){return hist}

},{}],87:[function(require,module,exports){
"use strict"
exports.mashI53=mashI53
exports.mashString=mashString
exports.randCreate=randCreate
exports.shuffleArray=shuffleArray
function mashString(data){var n=4022871197
for(var i=0;i<data.length;i++){n+=data.charCodeAt(i)
var h=.02519603282416938*n
n=h>>>0
h-=n
h*=n
n=h>>>0
h-=n
n+=h*4294967296}return n>>>0}function mashI53(data){var n=4022871197
while(data){var byte=data%256
data=(data-byte)/256
n+=byte
var h=.02519603282416938*n
n=h>>>0
h-=n
h*=n
n=h>>>0
h-=n
n+=h*4294967296}return(n>>>0)*2.3283064365386963e-10}function Mash(){this.n=3228327880}Mash.prototype.mash=function(data){var n=this.n+data
var h=.02519603282416938*n
n=h>>>0
h-=n
h*=n
n=h>>>0
h-=n
n+=h*4294967296
this.n=n
return(n>>>0)*2.3283064365386963e-10}
function Alea(seed){this.reseed(seed)}Alea.prototype.reseed=function(seed){this.c=1
var mash=new Mash
this.s0=.3014581324532628
this.s1=.2643220406025648
this.s2=.7516536582261324
this.s0-=mash.mash(seed)
if(this.s0<0){this.s0+=1}this.s1-=mash.mash(seed)
if(this.s1<0){this.s1+=1}this.s2-=mash.mash(seed)
if(this.s2<0){this.s2+=1}}
Alea.prototype.step=function(){var t=2091639*this.s0+this.c*2.3283064365386963e-10
this.s0=this.s1
this.s1=this.s2
return this.s2=t-(this.c=t|0)}
Alea.prototype.uint32=function(){return this.step()*4294967296}
Alea.prototype.fract53=function(){return this.step()+(this.step()*2097152|0)*11102230246251565e-32}
Alea.prototype.random=Alea.prototype.step
Alea.prototype.range=function(range){return this.step()*range|0}
Alea.prototype.floatBetween=function(a,b){return a+(b-a)*this.random()}
Alea.prototype.exportState=function(){return[this.s0,this.s1,this.s2,this.c]}
Alea.prototype.importState=function(i){this.s0=i[0]
this.s1=i[1]
this.s2=i[2]
this.c=i[3]}
function randCreate(seed){return new Alea(seed)}function shuffleArray(rand,arr){for(var ii=arr.length-1;ii>=1;--ii){var swap=rand.range(ii+1)
var t=arr[ii]
arr[ii]=arr[swap]
arr[swap]=t}}

},{}],88:[function(require,module,exports){
"use strict"
var assert=require("assert")
function EventEmitter(){this._listeners={}}module.exports=EventEmitter
module.exports.EventEmitter=EventEmitter
function addListener(ee,type,fn,once){assert(typeof fn==="function")
var arr=ee._listeners[type]
if(!arr){arr=ee._listeners[type]=[]}arr.push({once:once,fn:fn})}EventEmitter.prototype.hasListener=function(type,fn){var arr=this._listeners[type]
if(!arr){return false}for(var ii=0;ii<arr.length;++ii){if(arr[ii].fn===fn){return true}}return false}
EventEmitter.prototype.on=function(type,fn){addListener(this,type,fn,0)
return this}
EventEmitter.prototype.once=function(type,fn){addListener(this,type,fn,1)
return this}
EventEmitter.prototype.removeListener=function(type,fn){var arr=this._listeners[type]
assert(arr)
for(var ii=0;ii<arr.length;++ii){if(arr[ii].fn===fn){arr.splice(ii,1)
return this}}assert(false)
return this}
function filterNotOnce(elem){return!elem.once}EventEmitter.prototype.emit=function(type){var arr=this._listeners[type]
if(!arr){return false}var any=false
var any_once=false
for(var _len=arguments.length,args=new Array(_len>1?_len-1:0),_key=1;_key<_len;_key++){args[_key-1]=arguments[_key]}for(var ii=0;ii<arr.length;++ii){var elem=arr[ii]
any=true
elem.fn.apply(elem,args)
if(elem.once){any_once=true}}if(any_once){this._listeners[type]=arr.filter(filterNotOnce)}return any}

},{"assert":undefined}],89:[function(require,module,exports){
"use strict"
exports.arrayToSet=arrayToSet
exports.callEach=callEach
exports.clamp=clamp
exports.cleanStringSplit=cleanStringSplit
exports.cleanupStringArray=cleanupStringArray
exports.clone=clone
exports.cloneShallow=cloneShallow
exports.dateToSafeLocaleString=dateToSafeLocaleString
exports.deepAdd=deepAdd
exports.deepEqual=deepEqual
exports.defaults=defaults
exports.defaultsDeep=defaultsDeep
exports.deprecate=deprecate
exports.easeIn=easeIn
exports.easeInOut=easeInOut
exports.easeOut=easeOut
exports.eatPossiblePromise=eatPossiblePromise
exports.empty=empty
exports.errorString=errorString
exports.fract=fract
exports.has=has
exports.identity=identity
exports.inherits=inherits
exports.isInteger=isInteger
exports.isPowerOfTwo=isPowerOfTwo
exports.lerp=lerp
exports.lineCircleIntersect=lineCircleIntersect
exports.log2=log2
exports.logdata=logdata
exports.map01=map01
exports.matchAll=matchAll
exports.merge=merge
exports.mix=mix
exports.mod=mod
exports.nearSame=nearSame
exports.nextHighestPowerOfTwo=nextHighestPowerOfTwo
exports.nop=nop
exports.once=once
exports.plural=plural
exports.randomNot=randomNot
exports.ridx=ridx
exports.round100=round100
exports.round1000=round1000
exports.sanitize=sanitize
exports.secondsSince2020=secondsSince2020
exports.secondsToFriendlyString=secondsToFriendlyString
exports.sign=sign
exports.titleCase=titleCase
exports.toArray=toArray
exports.toNumber=toNumber
var assert=require("assert")
var abs=Math.abs,floor=Math.floor,min=Math.min,max=Math.max,random=Math.random,round=Math.round,pow=Math.pow,sqrt=Math.sqrt
function nop(){}function identity(a){return a}function once(fn){var called=false
return function(){if(called){return}called=true
fn.apply(void 0,arguments)}}function empty(obj){for(var key in obj){return false}return true}function easeInOut(v,a){var va=pow(v,a)
return va/(va+pow(1-v,a))}function easeIn(v,a){return 2*easeInOut(.5*v,a)}function easeOut(v,a){return 2*easeInOut(.5+.5*v,a)-1}function clone(obj){if(!obj){return obj}return JSON.parse(JSON.stringify(obj))}function merge(dest,src){for(var f in src){dest[f]=src[f]}return dest}function has(obj,field){return Object.prototype.hasOwnProperty.call(obj,field)}function defaults(dest,src){for(var f in src){if(!has(dest,f)){dest[f]=src[f]}}return dest}function defaultsDeep(dest,src){for(var f in src){if(!has(dest,f)){dest[f]=src[f]}else if(typeof dest[f]==="object"){defaultsDeep(dest[f],src[f])}}return dest}function cloneShallow(src){return merge({},src)}function deepEqual(a,b){if(Array.isArray(a)){if(!Array.isArray(b)){return false}if(a.length!==b.length){return false}for(var ii=0;ii<a.length;++ii){if(!deepEqual(a[ii],b[ii])){return false}}return true}else if(typeof a==="object"){if(typeof b!=="object"){return false}if(!a||!b){return!a&&!b}for(var key in a){if(!deepEqual(a[key],b[key])){return false}}for(var _key in b){if(b[_key]!==undefined&&a[_key]===undefined){return false}}return true}return a===b}function deepAdd(dest,src){assert(dest&&src)
for(var key in src){var value=src[key]
if(typeof value==="object"){var dest_sub=dest[key]=dest[key]||{}
assert.equal(typeof dest_sub,"object")
deepAdd(dest_sub,value)}else{dest[key]=(dest[key]||0)+value}}}function clamp(v,mn,mx){return min(max(mn,v),mx)}function lerp(a,v0,v1){return(1-a)*v0+a*v1}function mix(v0,v1,a){return(1-a)*v0+a*v1}function map01(number,in_min,in_max){return(number-in_min)/(in_max-in_min)}function sign(a){return a<0?-1:a>0?1:0}function mod(a,n){return(a%n+n)%n}function log2(val){for(var ii=1,jj=0;;ii<<=1,++jj){if(ii>=val){return jj}}}function ridx(arr,idx){arr[idx]=arr[arr.length-1]
arr.pop()}function round100(a){return round(a*100)/100}function round1000(a){return round(a*1e3)/1e3}function fract(a){return a-floor(a)}function nearSame(a,b,tol){return abs(b-a)<=tol}function titleCase(str){return str.split(" ").map(function(word){return""+word[0].toUpperCase()+word.slice(1)}).join(" ")}var EPSILON=1e-5
function lineCircleIntersect(p1,p2,pCircle,radius){var dp=[p2[0]-p1[0],p2[1]-p1[1]]
var a=dp[0]*dp[0]+dp[1]*dp[1]
var b=2*(dp[0]*(p1[0]-pCircle[0])+dp[1]*(p1[1]-pCircle[1]))
var c=pCircle[0]*pCircle[0]+pCircle[1]*pCircle[1]
c+=p1[0]*p1[0]+p1[1]*p1[1]
c-=2*(pCircle[0]*p1[0]+pCircle[1]*p1[1])
c-=radius*radius
var bb4ac=b*b-4*a*c
if(abs(a)<EPSILON||bb4ac<0){return false}var mu1=(-b+sqrt(bb4ac))/(2*a)
var mu2=(-b-sqrt(bb4ac))/(2*a)
if(mu1>=0&&mu1<=1||mu2>=0&&mu2<=1){return true}return false}function inherits(ctor,superCtor){assert(typeof superCtor==="function")
var ctor_proto_orig=ctor.prototype
ctor.prototype=Object.create(superCtor.prototype,{constructor:{value:ctor,enumerable:false,writable:true,configurable:true}})
for(var key in ctor_proto_orig){ctor.prototype[key]=ctor_proto_orig[key]}}function isPowerOfTwo(n){return(n&n-1)===0}function nextHighestPowerOfTwo(x){--x
for(var i=1;i<32;i<<=1){x|=x>>i}return x+1}function logdata(data){if(data===undefined){return""}var r=JSON.stringify(data)
if(r.length<120){return r}return r.slice(0,120-3)+"...("+r.length+")"}function isInteger(v){return typeof v==="number"&&isFinite(v)&&floor(v)===v}function toNumber(v){return Number(v)}function randomNot(not_value,max_value){var new_value
do{new_value=floor(random()*max_value)}while(new_value===not_value)
return new_value}function toArray(array_like){return Array.prototype.slice.call(array_like)}function arrayToSet(array){var ret=Object.create(null)
for(var ii=0;ii<array.length;++ii){ret[array[ii]]=true}return ret}function matchAll(str,re){var ret=[]
var m
do{m=re.exec(str)
if(m){ret.push(m[1])}}while(m)
return ret}function callEach(arr,pre_clear){if(arr&&arr.length){for(var _len=arguments.length,args=new Array(_len>2?_len-2:0),_key2=2;_key2<_len;_key2++){args[_key2-2]=arguments[_key2]}for(var ii=0;ii<arr.length;++ii){arr[ii].apply(arr,args)}}}var sanitize_regex=/[\uD800-\uDFFF\x00-\x1F\x7F\u1D54\u1D55\u2000-\u200F\u205F-\u206F\uFE00]/g
function sanitize(str){return(str||"").replace(sanitize_regex,"")}function plural(number,label){return""+label+(number===1?"":"s")}function secondsToFriendlyString(seconds,force_include_seconds){var days=floor(seconds/(60*60*24))
seconds-=days*60*60*24
var hours=floor(seconds/(60*60))
seconds-=hours*60*60
var minutes=floor(seconds/60)
seconds-=minutes*60
var resp=[]
if(days){var years=floor(days/365.25)
if(years){days-=floor(years*365.25)
resp.push(years+" "+plural(years,"year"))}resp.push(days+" "+plural(days,"day"))}if(hours){resp.push(hours+" "+plural(hours,"hour"))}if(minutes||!resp.length){resp.push(minutes+" "+plural(minutes,"minute"))}if(force_include_seconds){resp.push(seconds+" "+plural(seconds,"second"))}return resp.join(", ")}function secondsSince2020(){return floor(Date.now()/1e3)-1577836800}function dateToSafeLocaleString(date){var date_text
try{date_text=date.toLocaleString()}catch(e){console.error(e,"(Using toString as fallback)")
date_text=date.toString()}return date_text}var sw={}
sw.am=sw.an=sw.and=sw.as=sw.at=sw.be=sw.by=sw.el=sw.for=sw.in=sw.is=sw.la=sw.las=sw.los=sw.of=sw.on=sw.or=sw.the=sw.that=sw.this=sw.to=sw.with=true
function cleanupStringArray(string_array){return string_array.filter(function(s){return s.length>1&&s.length<=32&&!sw[s]})}function cleanStringSplit(string,pattern){var base=sanitize(string).replace(/[.,/\\@#£!$%^&*;:<>{}|?=\-+_`'"~[\]()]/g,"").replace(/\s{1,}/g," ")
return cleanupStringArray(base.toLowerCase().split(pattern).map(function(s){return s.trim()}))}function eatPossiblePromise(p){if(p&&p.catch){p.catch(nop)}}function errorString(e){var msg=String(e)
if(msg==="[object Object]"){try{msg=JSON.stringify(e)}catch(ignored){}}if(e&&e.stack&&e.message){msg=String(e.message)}msg=msg.slice(0,600)
return msg}function deprecate(exports,field,replacement){Object.defineProperty(exports,field,{get:function get(){assert(false,field+" is deprecated, use "+replacement+" instead")
return undefined}})}

},{"assert":undefined}],90:[function(require,module,exports){
"use strict"
var should_throw=true
function ok(exp,msg){if(exp){return true}if(should_throw){throw new Error("Assertion failed"+(msg?": "+msg:""))}return false}module.exports=ok
module.exports.ok=ok
function equal(a,b){if(a===b){return true}if(should_throw){throw new Error('Assertion failed: "'+a+'"==="'+b+'"')}return false}module.exports.equal=equal
function dothrow(doit){should_throw=doit}module.exports.dothrow=dothrow

},{}],91:[function(require,module,exports){
"use strict"
exports.identity_mat4=exports.identity_mat3=exports.half_vec=void 0
exports.ivec2=ivec2
exports.ivec3=ivec3
exports.m4TransformVec3=m4TransformVec3
exports.unit_vec=exports.mat4=exports.mat3=void 0
exports.v2abs=v2abs
exports.v2add=v2add
exports.v2addScale=v2addScale
exports.v2angle=v2angle
exports.v2copy=v2copy
exports.v2dist=v2dist
exports.v2distSq=v2distSq
exports.v2div=v2div
exports.v2dot=v2dot
exports.v2floor=v2floor
exports.v2iFloor=v2iFloor
exports.v2iNormalize=v2iNormalize
exports.v2iRound=v2iRound
exports.v2lengthSq=v2lengthSq
exports.v2lerp=v2lerp
exports.v2mul=v2mul
exports.v2normalize=v2normalize
exports.v2round=v2round
exports.v2same=v2same
exports.v2scale=v2scale
exports.v2set=v2set
exports.v2sub=v2sub
exports.v3add=v3add
exports.v3addScale=v3addScale
exports.v3angle=v3angle
exports.v3copy=v3copy
exports.v3cross=v3cross
exports.v3determinant=v3determinant
exports.v3dist=v3dist
exports.v3distSq=v3distSq
exports.v3div=v3div
exports.v3dot=v3dot
exports.v3floor=v3floor
exports.v3iAdd=v3iAdd
exports.v3iFloor=v3iFloor
exports.v3iMax=v3iMax
exports.v3iMin=v3iMin
exports.v3iMul=v3iMul
exports.v3iNormalize=v3iNormalize
exports.v3iRound=v3iRound
exports.v3iScale=v3iScale
exports.v3iSub=v3iSub
exports.v3lengthSq=v3lengthSq
exports.v3lerp=v3lerp
exports.v3mul=v3mul
exports.v3mulMat4=v3mulMat4
exports.v3normalize=v3normalize
exports.v3perspectiveProject=v3perspectiveProject
exports.v3pow=v3pow
exports.v3round=v3round
exports.v3same=v3same
exports.v3scale=v3scale
exports.v3scaleFloor=v3scaleFloor
exports.v3set=v3set
exports.v3sub=v3sub
exports.v3zero=v3zero
exports.v4add=v4add
exports.v4clone=v4clone
exports.v4copy=v4copy
exports.v4dot=v4dot
exports.v4fromRGBA=v4fromRGBA
exports.v4lerp=v4lerp
exports.v4mul=v4mul
exports.v4mulAdd=v4mulAdd
exports.v4same=v4same
exports.v4scale=v4scale
exports.v4set=v4set
exports.v4zero=v4zero
exports.vec1=vec1
exports.vec2=vec2
exports.vec3=vec3
exports.vec4=vec4
exports.zero_vec=exports.zaxis=exports.yaxis=exports.xaxis=void 0
var mat3Create=require("gl-mat3/create")
var mat4Create=require("gl-mat4/create")
var abs=Math.abs,acos=Math.acos,max=Math.max,min=Math.min,floor=Math.floor,pow=Math.pow,round=Math.round,sqrt=Math.sqrt
var mat3=mat3Create
exports.mat3=mat3
var mat4=mat4Create
exports.mat4=mat4
function vec1(v){return new Float32Array([v||0])}function vec2(a,b){var r=new Float32Array(2)
if(a||b){r[0]=a
r[1]=b}return r}function ivec2(a,b){var r=new Int32Array(2)
if(a||b){r[0]=a
r[1]=b}return r}function vec3(a,b,c){var r=new Float32Array(3)
if(a||b||c){r[0]=a
r[1]=b
r[2]=c}return r}function ivec3(a,b,c){var r=new Int32Array(3)
if(a||b||c){r[0]=a
r[1]=b
r[2]=c}return r}function vec4(a,b,c,d){var r=new Float32Array(4)
if(a||b||c||d){r[0]=a
r[1]=b
r[2]=c
r[3]=d}return r}function frozenVec4(a,b,c,d){return vec4(a,b,c,d)}var unit_vec=frozenVec4(1,1,1,1)
exports.unit_vec=unit_vec
var half_vec=frozenVec4(.5,.5,.5,.5)
exports.half_vec=half_vec
var zero_vec=frozenVec4(0,0,0,0)
exports.zero_vec=zero_vec
var identity_mat3=mat3()
exports.identity_mat3=identity_mat3
var identity_mat4=mat4()
exports.identity_mat4=identity_mat4
var xaxis=frozenVec4(1,0,0,0)
exports.xaxis=xaxis
var yaxis=frozenVec4(0,1,0,0)
exports.yaxis=yaxis
var zaxis=frozenVec4(0,0,1,0)
exports.zaxis=zaxis
function v2abs(out,a){out[0]=abs(a[0])
out[1]=abs(a[1])
return out}function v2add(out,a,b){out[0]=a[0]+b[0]
out[1]=a[1]+b[1]
return out}function v2addScale(out,a,b,s){out[0]=a[0]+b[0]*s
out[1]=a[1]+b[1]*s
return out}function v2angle(a,b){var mag=sqrt((a[0]*a[0]+a[1]*a[1])*(b[0]*b[0]+b[1]*b[1]))
return acos(min(max(mag&&(a[0]*b[0]+a[1]*b[1])/mag,-1),1))}function v2copy(out,a){out[0]=a[0]
out[1]=a[1]
return out}function v2dist(a,b){return sqrt((a[0]-b[0])*(a[0]-b[0])+(a[1]-b[1])*(a[1]-b[1]))}function v2distSq(a,b){return(a[0]-b[0])*(a[0]-b[0])+(a[1]-b[1])*(a[1]-b[1])}function v2div(out,a,b){out[0]=a[0]/b[0]
out[1]=a[1]/b[1]
return out}function v2dot(a,b){return a[0]*b[0]+a[1]*b[1]}function v2floor(out,a){out[0]=floor(a[0])
out[1]=floor(a[1])
return out}function v2iFloor(a){a[0]=floor(a[0])
a[1]=floor(a[1])
return a}function v2lengthSq(a){return a[0]*a[0]+a[1]*a[1]}function v2lerp(out,t,a,b){var it=1-t
out[0]=it*a[0]+t*b[0]
out[1]=it*a[1]+t*b[1]
return out}function v2mul(out,a,b){out[0]=a[0]*b[0]
out[1]=a[1]*b[1]
return out}function v2normalize(out,a){var len=a[0]*a[0]+a[1]*a[1]
if(len>0){len=1/sqrt(len)
out[0]=a[0]*len
out[1]=a[1]*len}return out}function v2iNormalize(a){var len=a[0]*a[0]+a[1]*a[1]
if(len>0){len=1/sqrt(len)
a[0]*=len
a[1]*=len}return a}function v2round(out,a){out[0]=round(a[0])
out[1]=round(a[1])
return out}function v2iRound(a){a[0]=round(a[0])
a[1]=round(a[1])
return a}function v2same(a,b){return a[0]===b[0]&&a[1]===b[1]}function v2scale(out,a,s){out[0]=a[0]*s
out[1]=a[1]*s
return out}function v2set(out,a,b){out[0]=a
out[1]=b
return out}function v2sub(out,a,b){out[0]=a[0]-b[0]
out[1]=a[1]-b[1]
return out}function v3add(out,a,b){out[0]=a[0]+b[0]
out[1]=a[1]+b[1]
out[2]=a[2]+b[2]
return out}function v3iAdd(a,b){a[0]+=b[0]
a[1]+=b[1]
a[2]+=b[2]
return a}function v3addScale(out,a,b,s){out[0]=a[0]+b[0]*s
out[1]=a[1]+b[1]*s
out[2]=a[2]+b[2]*s
return out}function v3angle(a,b){var mag=sqrt((a[0]*a[0]+a[1]*a[1]+a[2]*a[2])*(b[0]*b[0]+b[1]*b[1]+b[2]*b[2]))
return acos(min(max(mag&&(a[0]*b[0]+a[1]*b[1]+a[2]*b[2])/mag,-1),1))}function v3copy(out,a){out[0]=a[0]
out[1]=a[1]
out[2]=a[2]
return out}function v3cross(out,a,b){var a0=a[0]
var a1=a[1]
var a2=a[2]
var b0=b[0]
var b1=b[1]
var b2=b[2]
out[0]=a1*b2-a2*b1
out[1]=a2*b0-a0*b2
out[2]=a0*b1-a1*b0
return out}function v3determinant(a,b,c){var a00=a[0]
var a01=b[0]
var a02=c[0]
var a10=a[1]
var a11=b[1]
var a12=c[1]
var a20=a[2]
var a21=b[2]
var a22=c[2]
return a00*(a22*a11-a12*a21)+a01*(-a22*a10+a12*a20)+a02*(a21*a10-a11*a20)}function v3distSq(a,b){return(a[0]-b[0])*(a[0]-b[0])+(a[1]-b[1])*(a[1]-b[1])+(a[2]-b[2])*(a[2]-b[2])}function v3dist(a,b){return sqrt(v3distSq(a,b))}function v3div(out,a,b){out[0]=a[0]/b[0]
out[1]=a[1]/b[1]
out[2]=a[2]/b[2]
return out}function v3dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}function v3iFloor(a){a[0]=floor(a[0])
a[1]=floor(a[1])
a[2]=floor(a[2])
return a}function v3floor(out,a){out[0]=floor(a[0])
out[1]=floor(a[1])
out[2]=floor(a[2])
return out}function v3lengthSq(a){return a[0]*a[0]+a[1]*a[1]+a[2]*a[2]}function v3lerp(out,t,a,b){var it=1-t
out[0]=it*a[0]+t*b[0]
out[1]=it*a[1]+t*b[1]
out[2]=it*a[2]+t*b[2]
return out}function v3iMax(a,b){a[0]=max(a[0],b[0])
a[1]=max(a[1],b[1])
a[2]=max(a[2],b[2])
return a}function v3iMin(a,b){a[0]=min(a[0],b[0])
a[1]=min(a[1],b[1])
a[2]=min(a[2],b[2])
return a}function v3mul(out,a,b){out[0]=a[0]*b[0]
out[1]=a[1]*b[1]
out[2]=a[2]*b[2]
return out}function v3iMul(a,b){a[0]*=b[0]
a[1]*=b[1]
a[2]*=b[2]
return a}function v3mulMat4(out,a,m){var x=a[0]
var y=a[1]
var z=a[2]
out[0]=x*m[0]+y*m[4]+z*m[8]
out[1]=x*m[1]+y*m[5]+z*m[9]
out[2]=x*m[2]+y*m[6]+z*m[10]
return out}function m4TransformVec3(out,a,m){var x=a[0]
var y=a[1]
var z=a[2]
out[0]=x*m[0]+y*m[4]+z*m[8]+m[12]
out[1]=x*m[1]+y*m[5]+z*m[9]+m[13]
out[2]=x*m[2]+y*m[6]+z*m[10]+m[14]
return out}function v3normalize(out,a){var len=a[0]*a[0]+a[1]*a[1]+a[2]*a[2]
if(len>0){len=1/sqrt(len)
out[0]=a[0]*len
out[1]=a[1]*len
out[2]=a[2]*len}return out}function v3iNormalize(a){var len=a[0]*a[0]+a[1]*a[1]+a[2]*a[2]
if(len>0){len=1/sqrt(len)
a[0]*=len
a[1]*=len
a[2]*=len}return a}function v3perspectiveProject(out,a,m){var x=a[0]
var y=a[1]
var z=a[2]
var w=m[3]*x+m[7]*y+m[11]*z+m[15]
var invw=.5/(w||1e-5)
out[0]=(m[0]*x+m[4]*y+m[8]*z+m[12])*invw+.5
out[1]=(m[1]*x+m[5]*y+m[9]*z+m[13])*-invw+.5
out[2]=m[2]*x+m[6]*y+m[10]*z+m[14]
return out}function v3pow(out,a,exp){out[0]=pow(a[0],exp)
out[1]=pow(a[1],exp)
out[2]=pow(a[2],exp)
return out}function v3round(out,a){out[0]=round(a[0])
out[1]=round(a[1])
out[2]=round(a[2])
return out}function v3iRound(a){a[0]=round(a[0])
a[1]=round(a[1])
a[2]=round(a[2])
return a}function v3same(a,b){return a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2]}function v3scale(out,a,s){out[0]=a[0]*s
out[1]=a[1]*s
out[2]=a[2]*s
return out}function v3scaleFloor(out,a,s){out[0]=floor(a[0]*s)
out[1]=floor(a[1]*s)
out[2]=floor(a[2]*s)
return out}function v3iScale(a,s){a[0]*=s
a[1]*=s
a[2]*=s
return a}function v3set(out,a,b,c){out[0]=a
out[1]=b
out[2]=c
return out}function v3sub(out,a,b){out[0]=a[0]-b[0]
out[1]=a[1]-b[1]
out[2]=a[2]-b[2]
return out}function v3iSub(a,b){a[0]-=b[0]
a[1]-=b[1]
a[2]-=b[2]
return a}function v3zero(out){out[0]=out[1]=out[2]=0
return out}function v4add(out,a,b){out[0]=a[0]+b[0]
out[1]=a[1]+b[1]
out[2]=a[2]+b[2]
out[3]=a[3]+b[3]
return out}function v4clone(a){return a.slice(0)}function v4copy(out,a){out[0]=a[0]
out[1]=a[1]
out[2]=a[2]
out[3]=a[3]
return out}function v4dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3]}function v4fromRGBA(rgba){var r=rgba>>>24
var g=(rgba&16711680)>>16
var b=(rgba&65280)>>8
var a=rgba&255
return vec4(r/255,g/255,b/255,a/255)}function v4lerp(out,t,a,b){var it=1-t
out[0]=it*a[0]+t*b[0]
out[1]=it*a[1]+t*b[1]
out[2]=it*a[2]+t*b[2]
out[3]=it*a[3]+t*b[3]
return out}function v4mul(out,a,b){out[0]=a[0]*b[0]
out[1]=a[1]*b[1]
out[2]=a[2]*b[2]
out[3]=a[3]*b[3]
return out}function v4mulAdd(out,a,b,c){out[0]=a[0]*b[0]+c[0]
out[1]=a[1]*b[1]+c[1]
out[2]=a[2]*b[2]+c[2]
out[3]=a[3]*b[3]+c[3]
return out}function v4same(a,b){return a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2]&&a[3]===b[3]}function v4scale(out,a,s){out[0]=a[0]*s
out[1]=a[1]*s
out[2]=a[2]*s
out[3]=a[3]*s
return out}function v4set(out,a,b,c,d){out[0]=a
out[1]=b
out[2]=c
out[3]=d
return out}function v4zero(out){out[0]=out[1]=out[2]=out[3]=0
return out}

},{"gl-mat3/create":undefined,"gl-mat4/create":undefined}],92:[function(require,module,exports){
"use strict"
exports.isProfane=isProfane
exports.isReserved=isReserved
exports.profanityCommonStartup=profanityCommonStartup
exports.profanityFilterCommon=profanityFilterCommon
exports.reservedStartup=reservedStartup
var assert=require("assert")
var max=Math.max
var trans_src="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+"
var trans_dst="4bcd3fgh1jk1mn0pqr57uvwxy24bcd3fgh1jk1mn0pqr57uvwxy201234567897"
var trans_src_regex=/[a-zA-Z0-9+]+/g
var trans_lookup={}
function canonize(str){return str.split("").map(function(c){return trans_lookup[c]||c}).join("")}function rot13(str){return str.split("").map(function(c){c=c.charCodeAt(0)
if(c>=97&&c<=122){c=97+(c-97+13)%26}else if(c>=65&&c<=90){c=65+(c-65+13)%26}return String.fromCharCode(c)}).join("")}var profanity={}
var reserved={}
var suffixes=["","s","s","in","ing","er","ers","ed","y"]
var suffixes_canonized=["","5","35","1n","1ng","3r","3r5","3d","y"]
var max_len=0
var inited=false
function profanityCommonStartup(filter_gkg,exceptions_txt){assert(!inited)
inited=true
for(var ii=0;ii<trans_src.length;++ii){trans_lookup[trans_src[ii]]=trans_dst[ii]}var data=filter_gkg.split("\n").filter(function(a){return a})
for(var _ii=0;_ii<data.length;++_ii){var s=rot13(data[_ii])
var start_len=s.length
s=canonize(s)
assert.equal(start_len,s.length)
for(var jj=0;jj<suffixes_canonized.length;++jj){var str=s+suffixes_canonized[jj]
var existing=profanity[str]
if(!existing||existing>jj){max_len=max(max_len,str.length)
profanity[str]=jj+1}}}data=exceptions_txt.split("\n").filter(function(a){return a})
for(var _ii2=0;_ii2<data.length;++_ii2){delete profanity[canonize(data[_ii2])]}}function reservedStartup(reserved_txt){var data=reserved_txt.split("\n").filter(function(a){return a})
for(var i=0;i<data.length;++i){var string=canonize(data[i])
reserved[string]=1}}var randWord
function filterWord(word_src){if(word_src.length>=max_len){return word_src}var is_uppercase=word_src[0].toUpperCase()===word_src[0]
var word_canon=canonize(word_src)
var suffix_idx=profanity[word_canon]
if(!suffix_idx){return word_src}--suffix_idx
var word=randWord()
if(is_uppercase){word=word[0].toUpperCase()+word.slice(1)}var suffix=suffixes[suffix_idx]
if(word[word.length-1]===suffix[0]){suffix=suffix.slice(1)}if(word.endsWith("e")&&suffix[0]==="i"){word=word.slice(0,-1)}word+=suffix
return word}var is_profane
function checkWord(word_src){if(word_src.length>=max_len){return}if(profanity[canonize(word_src)]){is_profane=true}}function profanityFilterCommon(user_str,rand_word_fn){assert(inited)
randWord=rand_word_fn
return user_str.replace(trans_src_regex,filterWord)}function isProfane(user_str){assert(inited)
is_profane=false
user_str.replace(trans_src_regex,checkWord)
return is_profane}var is_reserved
function checkReserved(word_src){if(reserved[canonize(word_src)]){is_reserved=true}}function isReserved(user_str){assert(inited)
is_reserved=false
user_str.replace(trans_src_regex,checkReserved)
return is_reserved}

},{"assert":undefined}],93:[function(require,module,exports){
"use strict"
exports.PING_TIME=exports.CONNECTION_TIMEOUT=void 0
exports.netDelayGet=netDelayGet
exports.netDelaySet=netDelaySet
exports.sendMessage=sendMessage
exports.wsHandleMessage=wsHandleMessage
exports.wsPak=wsPak
exports.wsPakSendDest=wsPakSendDest
exports.wsstats_out=exports.wsstats=void 0
var wsstats={msgs:0,bytes:0}
exports.wsstats=wsstats
var wsstats_out={msgs:0,bytes:0}
exports.wsstats_out=wsstats_out
var ack=require("./ack.js")
var assert=require("assert")
var ackHandleMessage=ack.ackHandleMessage,ackReadHeader=ack.ackReadHeader,ackWrapPakStart=ack.ackWrapPakStart,ackWrapPakPayload=ack.ackWrapPakPayload,ackWrapPakFinish=ack.ackWrapPakFinish
var random=Math.random,round=Math.round
var packet=require("./packet.js")
var isPacket=packet.isPacket,packetCreate=packet.packetCreate,packetFromBuffer=packet.packetFromBuffer
var CONNECTION_TIMEOUT=6e4
exports.CONNECTION_TIMEOUT=CONNECTION_TIMEOUT
var PING_TIME=CONNECTION_TIMEOUT/2
exports.PING_TIME=PING_TIME
var PAK_HEADER_SIZE=1+1+16+1+9
var net_delay=0
var net_delay_rand=0
function socketSendInternal(client,buf,pak){if(client.ws_server){client.socket.send(buf,pak.pool.bind(pak))}else{client.socket.send(buf)
pak.pool()}}function netDelaySet(delay,rand){if(delay===undefined){delay=100
rand=50}if(delay){console.log("NetDelay: ON ("+delay+"+"+rand+")")}else{console.log("NetDelay: Off")}net_delay=delay
net_delay_rand=rand}function netDelayGet(){return[net_delay,net_delay_rand]}function NetDelayer(client,socket){this.client=client
this.head=null
this.tail=null
this.tick=this.tickFn.bind(this)}NetDelayer.prototype.send=function(buf,pak){var now=Date.now()
var delay=round(net_delay+net_delay_rand*random())
var time=now+delay
var elem={buf:buf,pak:pak,time:time,next:null}
if(this.tail){this.tail.next=elem
this.tail=elem}else{this.head=this.tail=elem
setTimeout(this.tick,delay)}}
NetDelayer.prototype.tickFn=function(){var client=this.client
if(client.net_delayer!==this){while(this.head){var elem=this.head
elem.pak.pool()
this.head=elem.next}this.tail=null
return}var now=Date.now()
do{var _elem=this.head
this.head=_elem.next
if(!this.head){this.tail=null}var buf=_elem.buf,pak=_elem.pak
socketSendInternal(client,buf,pak)}while(this.head&&this.head.time<=now)
if(this.head){setTimeout(this.tick,this.head.time-now)}}
function wsPakSendDest(client,pak){if(!client.connected||client.socket.readyState!==1){console.warn("Attempting to send on a disconnected link (client_id:"+client.id+"), ignoring")
pak.pool()
return}var buf=pak.getBuffer()
var buf_len=pak.getBufferLen()
if(buf_len!==buf.length){buf=new Uint8Array(buf.buffer,buf.byteOffset,buf_len)}wsstats_out.msgs++
wsstats_out.bytes+=buf.length
if(net_delay){if(!client.net_delayer){client.net_delayer=new NetDelayer(client)}client.net_delayer.send(buf,pak)}else{socketSendInternal(client,buf,pak)}client.last_send_time=Date.now()}function wsPakSendFinish(pak,err,resp_func){var _pak$ws_data=pak.ws_data,client=_pak$ws_data.client,msg=_pak$ws_data.msg
delete pak.ws_data
var ack_resp_pkt_id=ackWrapPakFinish(pak,err,resp_func)
if(!client.connected||client.socket.readyState!==1){if(msg==="channel_msg"){pak.seek(0)
pak.readFlags()
var header=ackReadHeader(pak)
var is_packet=isPacket(header.data)
var channel_id
var submsg
if(is_packet){pak.ref()
channel_id=pak.readAnsiString()
submsg=pak.readAnsiString()
if(!pak.ended()){pak.pool()}}else{channel_id=header.data.channel_id
submsg=header.data.msg}msg="channel_msg:"+channel_id+":"+submsg}if(typeof msg!=="number"){(client.log?client:console).log("Attempting to send msg="+msg+" on a disconnected link, ignoring")
if(!client.log&&client.onError&&msg){client.onError("Attempting to send msg="+msg+" on a disconnected link")}}if(ack_resp_pkt_id){delete client.resp_cbs[ack_resp_pkt_id]}pak.pool()
return}assert.equal(Boolean(resp_func&&resp_func.expecting_response!==false),Boolean(ack_resp_pkt_id))
wsPakSendDest(client,pak)}function wsPakSend(err,resp_func){var pak=this
if(typeof err==="function"&&!resp_func){resp_func=err
err=null}wsPakSendFinish(pak,err,resp_func)}function wsPak(msg,ref_pak,client){assert(typeof msg==="string"||typeof msg==="number")
var pak=packetCreate(ref_pak?ref_pak.getInternalFlags():packet.default_flags,ref_pak?ref_pak.totalSize()+PAK_HEADER_SIZE:0)
pak.writeFlags()
ackWrapPakStart(pak,client,msg)
pak.ws_data={msg:msg,client:client}
pak.send=wsPakSend
return pak}function sendMessageInternal(client,msg,err,data,resp_func){var is_packet=isPacket(data)
var pak=wsPak(msg,is_packet?data:null,client)
if(!err){ackWrapPakPayload(pak,data)}pak.send(err,resp_func)}function sendMessage(msg,data,resp_func){sendMessageInternal(this,msg,null,data,resp_func)}function wsHandleMessage(client,buf,filter){++wsstats.msgs
var now=Date.now()
var source=client.id?"client "+client.id:"server"
if(!(buf instanceof Uint8Array)){(client.log?client:console).log("Received incorrect WebSocket data type from "+source+" ("+typeof buf+")")
if(typeof buf==="string"){(client.log?client:console).log("Invalid WebSocket data: "+JSON.stringify(buf.slice(0,120)))}if(client.ws_server){if(!client.has_warned_about_text){client.has_warned_about_text=true
client.send("error","Server received non-binary WebSocket data.  "+"Likely cause is a proxy, VPN or something else intercepting and modifying network traffic.")}return}return void client.onError("Invalid data received")}wsstats.bytes+=buf.length
var pak=packetFromBuffer(buf,buf.length,false)
pak.readFlags()
client.last_receive_time=now
client.idle_counter=0
return void ackHandleMessage(client,source,pak,function sendFunc(msg,err,data,resp_func){if(resp_func&&!resp_func.expecting_response){resp_func=null}sendMessageInternal(client,msg,err,data,resp_func)},function pakFunc(msg,ref_pak){return wsPak(msg,ref_pak,client)},function handleFunc(msg,data,resp_func){var handler=client.handlers[msg]
if(!handler){var error_msg="No handler for message "+JSON.stringify(msg)+" from "+source
console.error(error_msg,isPacket(data)?data.contents():data)
if(client.onError){return client.onError(error_msg)}return resp_func(error_msg)}return handler(client,data,resp_func)},filter)}

},{"./ack.js":76,"./packet.js":85,"assert":undefined}]},{},[2])


//# sourceMappingURL=app.bundle.js.map
