import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import Layout from '@/components/Layout';
import Board from '@/pages/Board';
import Forum from '@/pages/Forum';
import Thread from '@/pages/Thread';
import Profile from '@/pages/Profile';
import Notifications from '@/pages/Notifications';
import Releases from '@/pages/Releases';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import OAuthConsent from '@/pages/OAuthConsent';
import AdminAstra from '@/pages/AdminAstra';
import SolanaLaunch from '@/pages/SolanaLaunch';
import SolanaMarket from '@/pages/SolanaMarket';
import { SolanaWalletProvider } from '@/lib/SolanaWalletContext';

const AuthenticatedApp=()=>{const{isLoadingAuth,isLoadingPublicSettings,authError,navigateToLogin}=useAuth();if(isLoadingPublicSettings||isLoadingAuth)return <div className="fixed inset-0 flex items-center justify-center"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;if(authError?.type==='user_not_registered')return <UserNotRegisteredError/>;if(authError?.type==='auth_required'){navigateToLogin();return null;}return <Routes><Route element={<Layout/>}><Route path="/" element={<Board/>}/><Route path="/launch" element={<SolanaLaunch/>}/><Route path="/solana/:mint" element={<SolanaMarket/>}/><Route path="/forum" element={<Forum/>}/><Route path="/post/:id" element={<Thread/>}/><Route path="/notifications" element={<Notifications/>}/><Route path="/releases" element={<Releases/>}/><Route path="/admin/astra" element={<AdminAstra/>}/><Route path="/profile" element={<Profile/>}/><Route path="/profile/:userId" element={<Profile/>}/></Route><Route path="*" element={<PageNotFound/>}/></Routes>};
export default function App(){return <AuthProvider><SolanaWalletProvider><QueryClientProvider client={queryClientInstance}><Router><ScrollToTop/><Routes><Route path="/login" element={<Login/>}/><Route path="/register" element={<Register/>}/><Route path="/forgot-password" element={<ForgotPassword/>}/><Route path="/reset-password" element={<ResetPassword/>}/><Route path="/oauth/consent" element={<OAuthConsent/>}/><Route path="/*" element={<AuthenticatedApp/>}/></Routes></Router><Toaster/><SonnerToaster position="top-center"/></QueryClientProvider></SolanaWalletProvider></AuthProvider>}