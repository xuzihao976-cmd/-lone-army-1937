import React from 'react';

const paths = {
  fortify: <><path d="m4 17 9-9m-3-4 4-1 6 6-3 3-6-6Z" /><path d="m3 16 3 3-2 2-3-3Z" /></>,
  search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></>,
  aid: <><path d="M4 7h16v13H4zM9 7V4h6v3m-3 4v6m-3-3h6" /></>,
  rest: <><path d="M4 15h16v5M4 20V6m0 5h5v4m0-4h7a4 4 0 0 1 4 4" /></>,
  speech: <><path d="m4 10 14-5v14L4 14zM7 15l2 5h3l-2-4m8-6h3v4h-3" /></>,
  recon: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  raid: <><path d="M19 15A8 8 0 0 1 9 4a8 8 0 1 0 10 11Zm-2-12v5m-2-2h4" /></>,
};

/** Original interface symbols; decorative and always paired with a text label. */
export default function OrderIcon({ name }: { name: keyof typeof paths }) {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
