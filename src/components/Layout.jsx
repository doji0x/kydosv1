import React from "react";
import { useLocation, useOutlet } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import TopBar from "@/components/nav/TopBar";
import BottomTabBar from "@/components/nav/BottomTabBar";
import { MeProvider } from "@/lib/MeContext";
import { SignInGateProvider } from "@/lib/SignInGate";
export default function Layout(){const{pathname}=useLocation();const outlet=useOutlet();const immersive=pathname==="/launch"||pathname.startsWith("/solana/")||pathname==="/admin/astra";return <MeProvider><SignInGateProvider><div className="min-h-screen flex flex-col">{!immersive&&<TopBar/>}<main className={`flex-1 ${immersive?'':'pb-28'}`}><AnimatePresence mode="wait" initial={false}><motion.div key={pathname} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-4}} transition={{duration:.12,ease:'easeOut'}}>{outlet}</motion.div></AnimatePresence></main>{!immersive&&<BottomTabBar/>}</div></SignInGateProvider></MeProvider>}