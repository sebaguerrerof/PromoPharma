interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

const EmptyState: React.FC<EmptyStateProps> = ({ title, description, action }) => (
  <div className="text-center py-20 px-4">
    <div className="mx-auto w-16 h-16 rounded-3xl bg-linear-to-br from-blue-100 to-cyan-100 flex items-center justify-center mb-5 shadow-md shadow-blue-100">
      <svg className="w-7 h-7 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
      </svg>
    </div>
    <p className="text-sm font-semibold text-gray-700">{title}</p>
    {description && (
      <p className="text-xs text-gray-400 mt-2 max-w-xs mx-auto leading-relaxed">{description}</p>
    )}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export default EmptyState;
