import React from "react";
import { startTrial, getUser } from "../api";

export default function Trial({ user, setTrialActive }) {
  const handleStart = async () => {
    await startTrial(user.id);
    setTrialActive(true);
  };

  return (
    <div>
      <h2>🎁 Start your free 1-day trial</h2>
      <p>Get full access to support for 24 hours.</p>
      <button onClick={handleStart}>Start Trial</button>
    </div>
  );
}
