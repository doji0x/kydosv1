import React, { createContext, useCallback, useContext, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { LOGO_URL } from "@/lib/brand";
import { useMe } from "@/lib/MeContext";

const GateContext = createContext({ requireAuth: () => true });

// Wraps guest actions: returns true when signed in, otherwise opens the prompt.
export function SignInGateProvider({ children }) {
  const { me } = useMe();
  const [action, setAction] = useState(null);

  const requireAuth = useCallback(
    (label) => {
      if (me) return true;
      setAction(label || "continue");
      return false;
    },
    [me]
  );

  return (
    <GateContext.Provider value={{ requireAuth }}>
      {children}
      <Dialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent className="bg-card sm:max-w-sm text-center">
          <img src={LOGO_URL} alt="Kydos" className="h-14 w-14 rounded-full mx-auto ring-1 ring-primary/40" />
          <h2 className="font-display font-bold text-xl mt-2">Sign in to {action}</h2>
          <p className="text-sm text-muted-foreground">
            Create a free account to trade, post and follow on Kydos. You start with 100 HOOD.
          </p>
          <div className="space-y-2 mt-2">
            <Button onClick={() => base44.auth.redirectToLogin()} className="w-full h-11 rounded-full font-semibold">
              <Sparkles className="h-4 w-4 mr-2" /> Sign in
            </Button>
            <Button variant="ghost" onClick={() => setAction(null)} className="w-full h-10 rounded-full text-muted-foreground">
              Maybe later
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </GateContext.Provider>
  );
}

export const useSignInGate = () => useContext(GateContext);