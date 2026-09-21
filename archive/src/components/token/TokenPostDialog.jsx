import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PostComposer from "@/components/forum/PostComposer";

export default function TokenPostDialog({ token, open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card sm:max-w-lg p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="font-display text-base">
            Post about <span className="font-mono text-primary">${token.ticker}</span>
          </DialogTitle>
        </DialogHeader>
        <PostComposer
          token={token}
          placeholder={`Why is $${token.ticker} going to run?`}
          onPosted={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}