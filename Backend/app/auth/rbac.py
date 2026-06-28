# backend/app/auth/rbac.py
from fastapi import Depends, HTTPException, status
from app.auth.models import User
from app.auth.manager import current_active_user

def require_role(*allowed_roles: str):
    """
    Dependency that checks if the current user has one of the allowed roles.
    Admin has access to everything implicitly.
    """
    def role_checker(user: User = Depends(current_active_user)) -> User:
        if user.role == "admin":
            return user
            
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation not permitted. Required roles: {', '.join(allowed_roles)}"
            )
        return user
    
    return role_checker
