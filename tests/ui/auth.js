import { state } from './runtime.js';
export const useAuth = () => ({user:state.authenticated?{id:'fixture-user'}:null,isAuthenticated:state.authenticated});
