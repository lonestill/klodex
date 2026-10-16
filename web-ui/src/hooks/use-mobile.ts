import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.addEventListener("resize", () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    })
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => window.removeEventListener("resize", mql as unknown as EventListener)
  }, [])

  return !!isMobile
}
