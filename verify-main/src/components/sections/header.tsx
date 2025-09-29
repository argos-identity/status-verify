import Image from "next/image";
import React from "react";
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from "@/components/ui/language-switcher";

const Header = () => {
  const t = useTranslations('navigation');

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
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <a
              href="#"
              className="inline-block rounded-[4px] bg-accent px-[15px] pt-[10px] pb-[9px] text-xs font-bold uppercase tracking-wider text-accent-foreground shadow-[inset_0_-2px_0_0_rgba(0,0,0,0.15)] transition-opacity hover:opacity-80"
            >
              {t('subscribeToUpdates')}
            </a>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;