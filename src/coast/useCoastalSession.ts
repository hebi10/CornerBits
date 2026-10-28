import {useEffect,useRef,useSyncExternalStore} from 'react';
import * as platform from '../platform';
import {CoastalSession} from './session';

export function useCoastalSession(){
  const reference=useRef<CoastalSession|null>(null);
  if(reference.current===null)reference.current=new CoastalSession({load:()=>platform.loadState(),save:state=>platform.saveState(state),export:state=>platform.exportBackup(state),restore:state=>platform.restoreState(state)});
  const session=reference.current;
  const view=useSyncExternalStore(session.subscribe,session.getSnapshot,session.getSnapshot);
  useEffect(()=>{void session.load();},[session]);
  return{view,session};
}