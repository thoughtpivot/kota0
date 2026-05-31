import type { BundlePhase } from "@/components/kota0/deploy/kota0BundleSharedState";

export type BundleStatusEvent = {
  type: "bundle-status";
  appId: string;
  phase: BundlePhase;
  ready: boolean;
  bundleFingerprint: string | null;
  phaseSince: number;
};

type Subscriber = (event: BundleStatusEvent) => void;

const subscribers = new Set<Subscriber>();

export function subscribeBundleStatus(cb: Subscriber): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

export function broadcastBundleStatus(event: BundleStatusEvent): void {
  for (const cb of subscribers) {
    try {
      cb(event);
    } catch {
      /* ignore subscriber errors */
    }
  }
}
