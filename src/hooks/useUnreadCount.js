import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMe } from '@/lib/MeContext';
import { getSeenAt } from '@/lib/notifications';
import { useNotificationsFeed } from '@/hooks/useNotificationsFeed';
export function useUnreadCount(){
 const {me}=useMe(),{pathname}=useLocation(),items=useNotificationsFeed(me),[unread,setUnread]=useState(0);
 useEffect(()=>{if(!me||!items||pathname==='/notifications')return setUnread(0);const seen=getSeenAt();setUnread(items.filter(item=>new Date(item.created_date).getTime()>seen).length);},[me,items,pathname]);
 return unread;
}