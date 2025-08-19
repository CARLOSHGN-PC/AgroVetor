from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

# O DefaultRouter gera automaticamente as URLs para nosso ViewSet.
# Ex: /usuarios/, /usuarios/{id}/, etc.
router = DefaultRouter()
router.register(r'usuarios', views.UsuarioViewSet, basename='usuario')
router.register(r'fazendas', views.FazendaViewSet, basename='fazenda')
router.register(r'talhoes', views.TalhaoViewSet, basename='talhao')
router.register(r'produtos', views.ProdutoViewSet, basename='produto')
router.register(r'aeronaves', views.AeronaveViewSet, basename='aeronave')
router.register(r'ordens-servico', views.OrdemServicoViewSet, basename='ordemservico')
router.register(r'aplicacoes', views.AplicacaoViewSet, basename='aplicacao')
router.register(r'estoques', views.EstoqueProdutoViewSet, basename='estoque')

# As URLs da API são agora determinadas automaticamente pelo router.
urlpatterns = [
    path('', include(router.urls)),
    # URL customizada para o relatório
    path('ordens-servico/<int:pk>/relatorio/', views.RelatorioOrdemServicoView.as_view(), name='relatorio-os'),
    # URLs para Analytics
    path('analytics/pilot-performance/', views.PilotPerformanceView.as_view(), name='pilot-performance'),
    path('analytics/product-performance/', views.ProductPerformanceView.as_view(), name='product-performance'),
]
