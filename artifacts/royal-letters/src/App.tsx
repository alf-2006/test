import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Compose from "@/pages/Compose";
import LetterView from "@/pages/LetterView";
import LetterDetail from "@/pages/LetterDetail";
import Settings from "@/pages/Settings";
import Analytics from "@/pages/Analytics";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/login" component={Login} />
      <Route path="/home" component={Home} />
      <Route path="/letter/:token" component={LetterView} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/compose" component={Compose} />
      <Route path="/compose/:id" component={Compose} />
      <Route path="/letters/:id" component={LetterDetail} />
      <Route path="/settings" component={Settings} />
      <Route path="/analytics" component={Analytics} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster
          position="top-center"
          dir="rtl"
          richColors
          closeButton
          toastOptions={{
            style: { fontFamily: "Cairo, sans-serif" },
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
