import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 text-slate-100">
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  );
};