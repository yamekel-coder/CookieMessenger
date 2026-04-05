export default function VerifiedBadge({ size = 14 }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="verified-badge"
      title="Подтверждённый аккаунт"
    >
      <circle cx="12" cy="12" r="12" fill="#1d9bf0" />
      <path
        d="M9.5 16.5L5.5 12.5L6.91 11.09L9.5 13.67L17.09 6.08L18.5 7.5L9.5 16.5Z"
        fill="white"
      />
    </svg>
  );
}
