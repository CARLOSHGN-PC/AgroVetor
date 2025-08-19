from rest_framework import permissions
from django.contrib.auth.models import Group

def _is_in_group(user, group_name):
    """
    Verifica se um usuário pertence a um grupo específico.
    """
    if user.is_authenticated:
        try:
            # Usar .name em vez de filter para ser mais direto se o grupo não existir
            return Group.objects.get(name=group_name).user_set.filter(id=user.id).exists()
        except Group.DoesNotExist:
            return False
    return False

class IsAdminGroup(permissions.BasePermission):
    """
    Permissão para verificar se o usuário está no grupo 'Administrador'.
    """
    def has_permission(self, request, view):
        return _is_in_group(request.user, 'Administrador')

class IsManagerGroup(permissions.BasePermission):
    """
    Permissão para verificar se o usuário está no grupo 'Gerente de Fazenda'.
    """
    def has_permission(self, request, view):
        return _is_in_group(request.user, 'Gerente de Fazenda') or _is_in_group(request.user, 'Administrador')

class IsPilotGroup(permissions.BasePermission):
    """
    Permissão para verificar se o usuário está no grupo 'Piloto'.
    """
    def has_permission(self, request, view):
        return _is_in_group(request.user, 'Piloto')

class IsOwnerOrAdmin(permissions.BasePermission):
    """
    Permissão para permitir que apenas o proprietário de um objeto ou um admin o edite.
    """
    def has_object_permission(self, request, view, obj):
        # Permissões de leitura são permitidas para qualquer requisição
        if request.method in permissions.SAFE_METHODS:
            return True

        # Se o usuário for admin, tem permissão total
        if _is_in_group(request.user, 'Administrador'):
            return True

        # Tenta encontrar um proprietário
        owner = None
        if hasattr(obj, 'proprietario'):
            owner = obj.proprietario
        elif hasattr(obj, 'fazenda') and hasattr(obj.fazenda, 'proprietario'):
            owner = obj.fazenda.proprietario
        elif hasattr(obj, 'ordem_servico'):
            # Para o modelo Aplicacao, a permissão é herdada da OS
            os = obj.ordem_servico
            if os.talhoes.exists():
                owner = os.talhoes.first().fazenda.proprietario
        elif hasattr(obj, 'talhoes'):
            # Para o modelo OrdemServico
            if obj.talhoes.exists():
                owner = obj.talhoes.first().fazenda.proprietario

        return owner == request.user
