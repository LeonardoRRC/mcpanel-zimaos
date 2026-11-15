/** MC Panel symbol: small cut for the sidebar, full one (with the >_ prompt) for the login card. */
export function Logo({ full }: { full?: boolean }) {
    return full ? (
        <svg className="logo" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path fill="#FF7A2E" fillRule="evenodd" d="M128.00 26.77 L214.00 76.43 L128.00 126.08 L42.00 76.43 Z M104.96 49.82 L141.44 70.88 L104.96 91.94 L93.44 85.29 L118.40 70.88 L93.44 56.47 Z M126.08 90.84 L151.04 105.25 L139.52 111.90 L114.56 97.49 Z" />
            <path fill="#F85102" d="M37.00 85.09 L123.00 134.74 L123.00 234.04 L37.00 184.39 Z" />
            <path fill="#B83B00" d="M133.00 134.74 L219.00 85.09 L219.00 184.39 L133.00 234.04 Z" />
        </svg>
    ) : (
        <svg className="logo" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path fill="#FF7A2E" fillRule="evenodd" d="M128.00 33.70 L202.00 76.43 L128.00 119.15 L54.00 76.43 Z" />
            <path fill="#F85102" d="M43.00 95.48 L117.00 138.20 L117.00 223.65 L43.00 180.93 Z" />
            <path fill="#B83B00" d="M139.00 138.20 L213.00 95.48 L213.00 180.93 L139.00 223.65 Z" />
        </svg>
    );
}
