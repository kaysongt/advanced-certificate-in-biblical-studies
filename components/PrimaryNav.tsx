"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { isPrimaryRouteActive, PRIMARY_NAV_ITEMS } from "@/lib/navigation";

export default function PrimaryNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function closeFromOutside(event: PointerEvent) {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) setOpen(false);
    }

    function closeFromEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromEscape);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromEscape);
    };
  }, [open]);

  return (
    <>
      {PRIMARY_NAV_ITEMS.map((item) => {
        const active = isPrimaryRouteActive(pathname, item.href);
        return (
          <Link
            className={`primary-nav-link${active ? " on" : ""}`}
            href={item.href}
            aria-current={active ? "page" : undefined}
            key={item.href}
          >
            {item.label}
          </Link>
        );
      })}

      <div className="mobile-primary-nav" ref={menu}>
        <button
          className="mobile-nav-trigger"
          type="button"
          aria-expanded={open}
          aria-controls="mobile-primary-menu"
          onClick={() => setOpen((current) => !current)}
        >
          Menu
          <span aria-hidden="true">{open ? "-" : "+"}</span>
        </button>
        <div className="mobile-primary-panel" id="mobile-primary-menu" hidden={!open}>
          {PRIMARY_NAV_ITEMS.map((item) => {
            const active = isPrimaryRouteActive(pathname, item.href);
            return (
              <Link
                className={active ? "on" : undefined}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                key={item.href}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
