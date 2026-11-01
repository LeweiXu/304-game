import { Outlet } from 'react-router-dom';
import Nav from './components/Nav';
import { useTheme } from './theme/theme';

export default function App() {
  const themeState = useTheme();
  return (
    <>
      <Nav themeState={themeState} />
      <Outlet />
    </>
  );
}
