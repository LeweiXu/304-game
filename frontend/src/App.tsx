import { Outlet } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import Nav from './components/Nav';
import { useTheme } from './theme/theme';

export default function App() {
  const themeState = useTheme();
  return (
    <>
      <Nav themeState={themeState} />
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
    </>
  );
}
