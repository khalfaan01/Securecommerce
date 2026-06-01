import React, { useState, useEffect } from 'react';
import { Layout } from '../components/layout';
import { Card, Button, Input, Badge } from '../components/ui';
import { useAuth } from '../context';
import { UserRole } from '../types';
import api from '../api';

// =============================================
// Profile Page
// =============================================

export const ProfilePage: React.FC = () => {
  const { user, updateUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // MFA State
  const [showMfaSetup, setShowMfaSetup] = useState(false);
  const [mfaData, setMfaData] = useState<{ secret: string; qrCodeUrl: string; recoveryCodes: string[] } | null>(null);
  const [mfaToken, setMfaToken] = useState('');
  const [isMfaLoading, setIsMfaLoading] = useState(false);

  // Password Change
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const handleUpdateProfile = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await api.put('/users/profile', formData);
      updateUser((response.data as any)?.user);
      setIsEditing(false);
      setMessage('Profile updated successfully');
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetupMfa = async () => {
    setIsMfaLoading(true);
    try {
      const response = await api.setupMfa();
      setMfaData(response.data!);
      setShowMfaSetup(true);
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to setup MFA');
    } finally {
      setIsMfaLoading(false);
    }
  };

  const handleVerifyMfa = async () => {
    setIsMfaLoading(true);
    try {
      await api.verifyMfa(mfaToken);
      setShowMfaSetup(false);
      setMfaData(null);
      setMfaToken('');
      updateUser({ ...user!, mfaEnabled: true });
      setMessage('MFA enabled successfully');
    } catch (error: any) {
      setError(error.response?.data?.error || 'Invalid MFA code');
    } finally {
      setIsMfaLoading(false);
    }
  };

  const handleDisableMfa = async () => {
    if (window.confirm('Are you sure you want to disable MFA?')) {
      try {
        const token = prompt('Enter your current MFA code:');
        const password = prompt('Enter your current password:');
        if (token && password) {
          await api.disableMfa(token, password);
          updateUser({ ...user!, mfaEnabled: false });
          setMessage('MFA disabled');
        }
      } catch (error: any) {
        setError(error.response?.data?.error || 'Failed to disable MFA');
      }
    }
  };

  const handleChangePassword = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    setIsLoading(true);
    try {
      await api.changePassword(passwordData.currentPassword, passwordData.newPassword);
      setShowPasswordChange(false);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMessage('Password changed successfully');
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Profile</h1>

        {message && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-700">{message}</p>
          </div>
        )}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Profile Information */}
        <Card title="Personal Information" className="mb-8">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="First Name"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                disabled={!isEditing}
              />
              <Input
                label="Last Name"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                disabled={!isEditing}
              />
            </div>
            <Input
              label="Email"
              type="email"
              value={formData.email}
              disabled
            />
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">Role:</span>
                <Badge text={user?.role || 'Customer'} variant={user?.role === UserRole.ADMIN ? 'danger' : 'info'} />
              </div>
              {isEditing ? (
                <div className="flex space-x-2">
                  <Button variant="secondary" onClick={() => setIsEditing(false)}>Cancel</Button>
                  <Button onClick={handleUpdateProfile} isLoading={isLoading}>Save</Button>
                </div>
              ) : (
                <Button onClick={() => setIsEditing(true)}>Edit Profile</Button>
              )}
            </div>
          </div>
        </Card>

        {/* MFA Section */}
        <Card title="Multi-Factor Authentication (MFA)" className="mb-8">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-600">
                {user?.mfaEnabled 
                  ? 'MFA is currently enabled. This adds an extra layer of security to your account.'
                  : 'Enable MFA to add an extra layer of security to your account.'}
              </p>
              <Badge 
                text={user?.mfaEnabled ? 'Enabled' : 'Disabled'} 
                variant={user?.mfaEnabled ? 'success' : 'warning'} 
              />
            </div>
            <Button 
              variant={user?.mfaEnabled ? 'danger' : 'primary'}
              onClick={user?.mfaEnabled ? handleDisableMfa : handleSetupMfa}
              isLoading={isMfaLoading}
            >
              {user?.mfaEnabled ? 'Disable MFA' : 'Setup MFA'}
            </Button>
          </div>

          {/* MFA Setup Modal */}
          {showMfaSetup && mfaData && (
            <div className="mt-6 p-6 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="text-lg font-semibold mb-4">Setup MFA</h3>
              <div className="text-center">
                <img 
                  src={mfaData.qrCodeUrl} 
                  alt="MFA QR Code" 
                  className="mx-auto mb-4 w-48 h-48"
                />
                <p className="text-sm text-gray-600 mb-2">Scan this QR code with your authenticator app</p>
                <p className="text-xs text-gray-500 mb-4">Secret: {mfaData.secret}</p>
                
                <div className="max-w-xs mx-auto">
                  <Input
                    label="Enter 6-digit code from app"
                    value={mfaToken}
                    onChange={(e) => setMfaToken(e.target.value)}
                    maxLength={6}
                    placeholder="000000"
                  />
                  <Button 
                    className="w-full"
                    onClick={handleVerifyMfa}
                    isLoading={isMfaLoading}
                    disabled={mfaToken.length !== 6}
                  >
                    Verify & Enable MFA
                  </Button>
                </div>
              </div>
              
              {/* Recovery Codes */}
              <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded">
                <p className="text-sm font-semibold text-yellow-800 mb-2">Recovery Codes (Save these!)</p>
                <p className="text-xs text-yellow-700 mb-2">Use these if you lose access to your authenticator app.</p>
                <div className="grid grid-cols-2 gap-2">
                  {mfaData.recoveryCodes.map((code, i) => (
                    <code key={i} className="px-2 py-1 bg-white rounded text-sm font-mono">{code}</code>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Password Change */}
        <Card title="Change Password" className="mb-8">
          {showPasswordChange ? (
            <div className="space-y-4">
              <Input
                label="Current Password"
                type="password"
                value={passwordData.currentPassword}
                onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
              />
              <Input
                label="New Password"
                type="password"
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
              />
              <Input
                label="Confirm New Password"
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
              />
              <div className="flex space-x-2">
                <Button variant="secondary" onClick={() => setShowPasswordChange(false)}>Cancel</Button>
                <Button onClick={handleChangePassword} isLoading={isLoading}>Change Password</Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setShowPasswordChange(true)}>Change Password</Button>
          )}
        </Card>
      </div>
    </Layout>
  );
};