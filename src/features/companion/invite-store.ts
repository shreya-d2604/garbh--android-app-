// The plaintext invite code is shown ONCE (only its hash is stored). Keep it in memory, never on
// disk, so the patient can leave and re-open the invite screen while the code is still valid.
import { create } from 'zustand';

export interface InviteDraftState {
  code: string | null;
  setCode: (code: string | null) => void;
}

export const useInviteDraft = create<InviteDraftState>((set) => ({
  code: null,
  setCode: (code) => set({ code }),
}));
