import React from "react";

export default function Upgrade({ user }) {
  return (
    <div>
      <h2>Upgrade Now</h2>
      <p>The trial has expired. Choose a package and pay via USDT (TRC20).</p>
      <div>
        <div>
          <h3>Starter – $49/month</h3>
          <p>5 requests/week</p>
        </div>
        <div>
          <h3>Pro – $119/month</h3>
          <p>10 requests/week + priority</p>
        </div>
        <div>
          <h3>Elite – $299/month</h3>
          <p>Unlimited + live call access</p>
        </div>
      </div>
      <div>
        <p>Pay with USDT (TRC20):</p>
        <code>trc20: TE6cbin6JJ5EFVFBso6stgV9HM6X2wRgrP</code>
      </div>
      <p>
        After payment, <a href="https://t.me/YourSupportBot">contact support</a> to
        activate your plan.
      </p>
    </div>
  );
}
