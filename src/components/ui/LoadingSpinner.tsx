const LoadingSpinner: React.FC<{ text?: string }> = ({ text = 'Cargando...' }) => (
  <div className="flex flex-col items-center justify-center py-20">
    <div className="relative">
      <div className="w-10 h-10 rounded-full border-2 border-gray-200" />
      <div className="absolute inset-0 w-10 h-10 rounded-full border-2 border-transparent border-t-blue-600 animate-spin" />
    </div>
    <p className="mt-4 text-xs text-gray-400 tracking-wide">{text}</p>
  </div>
);

export default LoadingSpinner;
