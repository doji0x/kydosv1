import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { fetchNotifications } from '@/lib/notifications';
export function useNotificationsFeed(me){
 const [items,setItems]=useState(null);
 useEffect(()=>{if(!me){setItems(me===null?[]:null);return;}let timer,active=true;const load=()=>fetchNotifications(me).then(value=>{if(active)setItems(value);});const schedule=()=>{clearTimeout(timer);timer=setTimeout(load,250);};load();const unsubs=[base44.entities.PostLike.subscribe(schedule),base44.entities.Post.subscribe(schedule),base44.entities.Follow.subscribe(schedule)];return()=>{active=false;clearTimeout(timer);unsubs.forEach(unsubscribe=>unsubscribe());};},[me]);
 return items;
}