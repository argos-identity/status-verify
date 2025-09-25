import Image from "next/image";
import React from "react";

const Header = () => {
  return (
    <header className="bg-background">
      <div className="mx-auto max-w-[850px] px-5 pt-[70px] pb-[70px] md:px-0">
        <div className="flex items-center justify-between">
          <a href="https://argosidentity.com/">
            <Image
              src="/logo.jpg"
              alt="Argosidentity logo"
              width={180}
              height={26}
            />
          </a>
          <a
            href="#"
            className="inline-block rounded-[4px] bg-accent px-[15px] pt-[10px] pb-[9px] text-xs font-bold uppercase tracking-wider text-accent-foreground shadow-[inset_0_-2px_0_0_rgba(0,0,0,0.15)] transition-opacity hover:opacity-80"
          >
            Subscribe to updates
          </a>
        </div>
      </div>
    </header>
  );
};

export default Header;