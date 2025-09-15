import { useState, useEffect } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { CartProvider } from "@/hooks/useCart";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import Layout from "@/components/Layout";
// WebSocket client import commented out due to compilation errors
// import { webSocketClient } from "./lib/websocket";

// Pages
import Dashboard from "@/pages/Dashboard";
import Products from "@/pages/Products";
import Catalog from "@/pages/Catalog";
import ProductDetail from "@/pages/ProductDetail";
import Cart from "@/pages/Cart";
import Orders from "@/pages/Orders";
import OrderDetail from "@/pages/OrderDetail";
import Warehouses from "@/pages/Warehouses";
import WhatsApp from "@/pages/WhatsApp";
import Analytics from "@/pages/Analytics";
import Vendors from "@/pages/Vendors";
import VendorDetail from "@/pages/VendorDetail";
import NotFound from "@/pages/not-found";

function AuthenticatedRoutes() {
  const { user } = useAuth();
  const isEmployee = user?.role === 'employee';
  const [location] = useLocation();

  // Employee route protection
  useEffect(() => {
    if (isEmployee) {
      const allowedPaths = ['/catalog', '/vendors', '/orders', '/cart'];
      const isAllowedPath = allowedPaths.some(path => 
        location === path || 
        location.startsWith(path + '/') ||
        (path === '/orders' && location.startsWith('/orders/'))
      );
      
      // Redirect employees to catalog if accessing restricted areas
      if (location === '/' || !isAllowedPath) {
        window.location.href = '/catalog';
      }
    }
  }, [location, isEmployee]);

  return (
    <Layout>
      <Switch>
        {/* Admin-only routes */}
        {!isEmployee && (
          <>
            <Route path="/" component={Dashboard} />
            <Route path="/products" component={Products} />
            <Route path="/products/:id" component={ProductDetail} />
            <Route path="/warehouses" component={Warehouses} />
            <Route path="/whatsapp" component={WhatsApp} />
            <Route path="/analytics" component={Analytics} />
          </>
        )}
        
        {/* Shared routes (both admin and employee) */}
        <Route path="/catalog" component={Catalog} />
        <Route path="/cart" component={Cart} />
        <Route path="/orders" component={Orders} />
        <Route path="/orders/:id" component={OrderDetail} />
        <Route path="/vendors" component={Vendors} />
        <Route path="/vendors/:id" component={VendorDetail} />
        
        {/* Employee default redirect */}
        {isEmployee && <Route path="/" component={() => { window.location.href = '/catalog'; return null; }} />}
        
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function LoginForm() {
  const { login } = useAuth();
  const [activeTab, setActiveTab] = useState<'admin' | 'employee'>('admin');
  const [isLoading, setIsLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [registerData, setRegisterData] = useState({
    name: "",
    email: "",
    mobile: "",
    password: "",
    confirmPassword: ""
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [, navigate] = useLocation();

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      await login(credentials.username, credentials.password);
      window.location.href = "/";
    } catch (error) {
      setError("Invalid admin credentials");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmployeeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      await login(credentials.username, credentials.password);
      window.location.href = "/";
    } catch (error) {
      setError("Invalid employee credentials");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmployeeRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setSuccess("");

    if (registerData.password !== registerData.confirmPassword) {
      setError("Passwords don't match");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/employee-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: registerData.name,
          email: registerData.email,
          mobile: registerData.mobile,
          password: registerData.password
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Registration failed");
      }

      const data = await response.json();
      setSuccess("Account created successfully! You can now sign in with your credentials.");
      setIsRegistering(false);
      setRegisterData({ name: "", email: "", mobile: "", password: "", confirmPassword: "" });
    } catch (error: any) {
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="w-16 h-16 bg-primary rounded-lg flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path>
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-foreground">StockSmart Hub</h2>
          <p className="mt-2 text-muted-foreground">Access your inventory management system</p>
        </div>

        {/* Tabs */}
        <div className="border-b border-border">
          <nav className="flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => {
                setActiveTab('admin');
                setError("");
                setSuccess("");
                setIsRegistering(false);
              }}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'admin'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              👑 Admin Login
            </button>
            <button
              onClick={() => {
                setActiveTab('employee');
                setError("");
                setSuccess("");
                setIsRegistering(false);
              }}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'employee'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              👥 Employee Access
            </button>
          </nav>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          {/* Error/Success Messages */}
          {error && (
            <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-800 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 rounded-md bg-green-50 border border-green-200 text-green-800 text-sm">
              {success}
            </div>
          )}

          {activeTab === 'admin' ? (
            /* Admin Login Form */
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">Administrator Login</h3>
              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div>
                  <label htmlFor="admin-username" className="block text-sm font-medium text-foreground">
                    Username
                  </label>
                  <input
                    id="admin-username"
                    type="text"
                    required
                    value={credentials.username}
                    onChange={(e) => setCredentials(prev => ({ ...prev, username: e.target.value }))}
                    className="mt-1 block w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="Enter admin username"
                  />
                </div>
                <div>
                  <label htmlFor="admin-password" className="block text-sm font-medium text-foreground">
                    Password
                  </label>
                  <input
                    id="admin-password"
                    type="password"
                    required
                    value={credentials.password}
                    onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                    className="mt-1 block w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="Enter admin password"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50"
                >
                  {isLoading ? "Signing in..." : "Sign in as Admin"}
                </button>
              </form>
              <div className="mt-4 text-center text-sm text-muted-foreground">
                Demo: admin / admin
              </div>
            </div>
          ) : (
            /* Employee Section */
            <div>
              {!isRegistering ? (
                /* Employee Login */
                <div>
                  <h3 className="text-lg font-medium text-foreground mb-4">Employee Sign In</h3>
                  <form onSubmit={handleEmployeeLogin} className="space-y-4">
                    <div>
                      <label htmlFor="employee-username" className="block text-sm font-medium text-foreground">
                        Username or Email
                      </label>
                      <input
                        id="employee-username"
                        type="text"
                        required
                        value={credentials.username}
                        onChange={(e) => setCredentials(prev => ({ ...prev, username: e.target.value }))}
                        className="mt-1 block w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        placeholder="Enter your username or email"
                      />
                    </div>
                    <div>
                      <label htmlFor="employee-password" className="block text-sm font-medium text-foreground">
                        Password
                      </label>
                      <input
                        id="employee-password"
                        type="password"
                        required
                        value={credentials.password}
                        onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                        className="mt-1 block w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        placeholder="Enter your password"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50"
                    >
                      {isLoading ? "Signing in..." : "Sign In"}
                    </button>
                  </form>
                  <div className="mt-4 text-center">
                    <button
                      onClick={() => setIsRegistering(true)}
                      className="text-sm text-primary hover:text-primary/80 font-medium"
                    >
                      Don't have an account? Create one →
                    </button>
                  </div>
                  <div className="mt-2 text-center text-sm text-muted-foreground">
                    Demo: employee / employee123
                  </div>
                </div>
              ) : (
                /* Employee Registration */
                <div>
                  <h3 className="text-lg font-medium text-foreground mb-4">Create Employee Account</h3>
                  <form onSubmit={handleEmployeeRegister} className="space-y-4">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-foreground">
                        Full Name *
                      </label>
                      <input
                        id="name"
                        type="text"
                        required
                        value={registerData.name}
                        onChange={(e) => setRegisterData(prev => ({ ...prev, name: e.target.value }))}
                        className="mt-1 block w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        placeholder="John Doe"
                      />
                    </div>
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-foreground">
                        Email Address *
                      </label>
                      <input
                        id="email"
                        type="email"
                        required
                        value={registerData.email}
                        onChange={(e) => setRegisterData(prev => ({ ...prev, email: e.target.value }))}
                        className="mt-1 block w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        placeholder="john@company.com"
                      />
                    </div>
                    <div>
                      <label htmlFor="mobile" className="block text-sm font-medium text-foreground">
                        Mobile Number *
                      </label>
                      <input
                        id="mobile"
                        type="tel"
                        required
                        value={registerData.mobile}
                        onChange={(e) => setRegisterData(prev => ({ ...prev, mobile: e.target.value }))}
                        className="mt-1 block w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        placeholder="+1234567890"
                      />
                    </div>
                    <div>
                      <label htmlFor="reg-password" className="block text-sm font-medium text-foreground">
                        Password *
                      </label>
                      <input
                        id="reg-password"
                        type="password"
                        required
                        value={registerData.password}
                        onChange={(e) => setRegisterData(prev => ({ ...prev, password: e.target.value }))}
                        className="mt-1 block w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        placeholder="Enter a strong password"
                      />
                    </div>
                    <div>
                      <label htmlFor="confirm-password" className="block text-sm font-medium text-foreground">
                        Confirm Password *
                      </label>
                      <input
                        id="confirm-password"
                        type="password"
                        required
                        value={registerData.confirmPassword}
                        onChange={(e) => setRegisterData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                        className="mt-1 block w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        placeholder="Confirm your password"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50"
                    >
                      {isLoading ? "Creating Account..." : "Create Account"}
                    </button>
                  </form>
                  <div className="mt-4 text-center">
                    <button
                      onClick={() => {
                        setIsRegistering(false);
                        setRegisterData({ name: "", email: "", mobile: "", password: "", confirmPassword: "" });
                      }}
                      className="text-sm text-muted-foreground hover:text-foreground"
                    >
                      ← Back to Sign In
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AppRouter() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return isAuthenticated ? <AuthenticatedRoutes /> : <LoginForm />;
}

function App() {
  // WebSocket initialization commented out due to compilation errors
  // useEffect(() => {
  //   // Initialize WebSocket connection for real-time updates
  //   webSocketClient.connect();
  //   
  //   return () => {
  //     webSocketClient.disconnect();
  //   };
  // }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <TooltipProvider>
          <Toaster />
          <AppRouter />
        </TooltipProvider>
      </CartProvider>
    </QueryClientProvider>
  );
}

export default App;
