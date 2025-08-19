from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db.models import Sum, Avg, F, Value, CharField, Count, FloatField
from django.db.models.functions import Coalesce
from rest_framework_gis.filters import InBBoxFilter

from .models import (
    Usuario, Fazenda, Talhao, Produto, Aeronave, OrdemServico, Aplicacao,
    EstoqueProduto
)
from .serializers import (
    UsuarioSerializer, FazendaSerializer, TalhaoSerializer, ProdutoSerializer,
    AeronaveSerializer, OrdemServicoSerializer, AplicacaoSerializer,
    EstoqueProdutoSerializer
)
from .permissions import IsAdminGroup, IsOwnerOrAdmin
from . import services

class UsuarioViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint que permite visualizar usuários. Apenas Admins.
    """
    queryset = Usuario.objects.all().order_by('-date_joined')
    serializer_class = UsuarioSerializer
    permission_classes = [permissions.IsAdminUser]

class FazendaViewSet(viewsets.ModelViewSet):
    """
    API endpoint para Fazendas.
    Filtra para mostrar apenas as fazendas do usuário logado (ou todas se for admin).
    """
    serializer_class = FazendaSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]

    def get_queryset(self):
        if self.request.user.groups.filter(name='Administrador').exists():
            return Fazenda.objects.all()
        return Fazenda.objects.filter(proprietario=self.request.user)

    def perform_create(self, serializer):
        serializer.save(proprietario=self.request.user)

class TalhaoViewSet(viewsets.ModelViewSet):
    """
    API endpoint para Talhões (GeoJSON).
    """
    serializer_class = TalhaoSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]
    bbox_filter_field = 'geometria'
    filter_backends = (InBBoxFilter,)

    def get_queryset(self):
        if self.request.user.groups.filter(name='Administrador').exists():
            return Talhao.objects.all()
        return Talhao.objects.filter(fazenda__proprietario=self.request.user)

class ProdutoViewSet(viewsets.ModelViewSet):
    """
    API endpoint para Produtos. Apenas Admins podem gerenciar.
    """
    queryset = Produto.objects.all()
    serializer_class = ProdutoSerializer
    permission_classes = [IsAdminGroup]

class AeronaveViewSet(viewsets.ModelViewSet):
    """
    API endpoint para Aeronaves. Apenas Admins podem gerenciar.
    """
    queryset = Aeronave.objects.all()
    serializer_class = AeronaveSerializer
    permission_classes = [IsAdminGroup]

class OrdemServicoViewSet(viewsets.ModelViewSet):
    """
    API endpoint para Ordens de Serviço.
    """
    serializer_class = OrdemServicoSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]

    def get_queryset(self):
        if self.request.user.groups.filter(name='Administrador').exists():
            return OrdemServico.objects.all().distinct()
        return OrdemServico.objects.filter(talhoes__fazenda__proprietario=self.request.user).distinct()

    def perform_create(self, serializer):
        instance = serializer.save()
        instance.calcular_totais()
        instance.save()

    def perform_update(self, serializer):
        instance = serializer.save()
        instance.calcular_totais()
        instance.save()

class AplicacaoViewSet(viewsets.ModelViewSet):
    """
    API endpoint para Aplicações de Voo (GeoJSON).
    """
    serializer_class = AplicacaoSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]
    bbox_filter_field = 'geometria_aplicada'
    filter_backends = (InBBoxFilter,)

    def get_queryset(self):
        if self.request.user.groups.filter(name='Administrador').exists():
            return Aplicacao.objects.all().distinct()
        return Aplicacao.objects.filter(ordem_servico__talhoes__fazenda__proprietario=self.request.user).distinct()

    @action(detail=True, methods=['post'], url_path='processar-log')
    def processar_log(self, request, pk=None):
        """
        Endpoint para fazer upload de um arquivo de log e iniciar o processamento.
        """
        aplicacao = self.get_object()
        log_file = request.FILES.get('log_file')

        if not log_file:
            return Response(
                {"error": "Nenhum arquivo de log enviado."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # O arquivo é lido em memória e decodificado como texto
            log_content = log_file.read().decode('utf-8')
            # Chama o serviço de processamento
            aplicacao_processada = services.process_flight_log(aplicacao.id, log_content)
            # Retorna os dados atualizados da aplicação
            serializer = self.get_serializer(aplicacao_processada)
            return Response(serializer.data)
        except services.GeoProcessingError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            # Captura de outros erros inesperados durante o processamento
            return Response(
                {"error": f"Ocorreu um erro inesperado: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class EstoqueProdutoViewSet(viewsets.ModelViewSet):
    """
    API endpoint para o Estoque de Produtos.
    """
    serializer_class = EstoqueProdutoSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]

    def get_queryset(self):
        if self.request.user.groups.filter(name='Administrador').exists():
            return EstoqueProduto.objects.all()
        return EstoqueProduto.objects.filter(fazenda__proprietario=self.request.user)


class RelatorioOrdemServicoView(APIView):
    """
    View customizada para gerar um relatório consolidado de uma Ordem de Serviço.
    """
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]

    def get(self, request, pk, format=None):
        """
        Retorna um relatório detalhado da Ordem de Serviço.
        """
        ordem_servico = get_object_or_404(OrdemServico, pk=pk)
        self.check_object_permissions(request, ordem_servico)

        # Usando os serializers existentes para construir a resposta
        os_data = OrdemServicoSerializer(ordem_servico).data
        talhoes_data = TalhaoSerializer(ordem_servico.talhoes.all(), many=True).data

        # Tentando obter a aplicação relacionada
        try:
            aplicacao_data = AplicacaoSerializer(ordem_servico.aplicacao).data
        except OrdemServico.aplicacao.RelatedObjectDoesNotExist:
            aplicacao_data = None

        # Montando o JSON final
        relatorio = {
            "ordem_servico": os_data,
            "talhoes_planejados": talhoes_data,
            "aplicacao_executada": aplicacao_data,
            # Adicionar mais dados conforme necessário, ex: dados climáticos
        }

        return Response(relatorio)


class PilotPerformanceView(APIView):
    """
    Endpoint de análise de performance por piloto.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, format=None):
        # Apenas OS concluídas com aplicação devem entrar na análise
        queryset = OrdemServico.objects.filter(status='CONCLUIDA', aplicacao__isnull=False)

        # Filtra para o usuário atual, a menos que seja admin
        if not request.user.groups.filter(name='Administrador').exists():
            queryset = queryset.filter(talhoes__fazenda__proprietario=request.user)

        # Agrega os dados
        performance_data = queryset.values('piloto_responsavel').annotate(
            total_ordens=Count('id', distinct=True),
            total_area_planejada=Sum('area_planejada_ha'),
            total_area_correta=Sum('aplicacao__area_correta_ha'),
            total_desperdicio=Sum('aplicacao__area_desperdicio_ha'),
            # Eficiência Média: (soma_areas_corretas / soma_areas_planejadas) * 100
            # Usamos Coalesce para evitar divisão por zero se a área planejada for 0
            eficiencia_media=Avg(
                (F('aplicacao__area_correta_ha') * 100.0) / Coalesce(F('area_planejada_ha'), Value(1.0, output_field=FloatField()))
            )
        ).order_by('-total_ordens')

        return Response(performance_data)

class ProductPerformanceView(APIView):
    """
    Endpoint de análise de performance por produto.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, format=None):
        queryset = OrdemServico.objects.filter(status='CONCLUIDA', aplicacao__isnull=False)

        if not request.user.groups.filter(name='Administrador').exists():
            queryset = queryset.filter(talhoes__fazenda__proprietario=request.user)

        performance_data = queryset.values(
            'produto__nome'
        ).annotate(
            nome_produto=F('produto__nome'),
            total_ordens=Count('id', distinct=True),
            total_volume_aplicado=Sum('volume_necessario_litros'),
            dosagem_media_ha=Avg('dosagem_recomendada'),
            eficiencia_media=Avg(
                (F('aplicacao__area_correta_ha') * 100.0) / Coalesce(F('area_planejada_ha'), Value(1.0, output_field=FloatField()))
            )
        ).values(
            'nome_produto', 'total_ordens', 'total_volume_aplicado',
            'dosagem_media_ha', 'eficiencia_media'
        ).order_by('-total_ordens')

        return Response(performance_data)
