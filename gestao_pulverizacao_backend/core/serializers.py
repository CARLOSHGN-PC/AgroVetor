from rest_framework_gis.serializers import GeoFeatureModelSerializer
from rest_framework import serializers
from .models import (
    Usuario, Fazenda, Talhao, Produto, Aeronave, OrdemServico, Aplicacao,
    EstoqueProduto
)

class UsuarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Usuario
        fields = ['id', 'username', 'email', 'first_name', 'last_name']

class ProdutoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Produto
        fields = ['id', 'nome', 'ingrediente_ativo', 'custo_por_litro']

class AeronaveSerializer(serializers.ModelSerializer):
    class Meta:
        model = Aeronave
        fields = ['id', 'prefixo', 'modelo', 'largura_faixa_aplicacao', 'custo_hora_voo']

class FazendaSerializer(serializers.ModelSerializer):
    # Serializador aninhado para mostrar os talhões (somente leitura)
    talhoes = serializers.StringRelatedField(many=True, read_only=True)
    proprietario = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = Fazenda
        fields = ['id', 'nome', 'proprietario', 'cidade', 'estado', 'talhoes']


class TalhaoSerializer(GeoFeatureModelSerializer):
    """ Serializador para o modelo Talhao com suporte a GeoJSON. """
    fazenda = serializers.StringRelatedField(read_only=True)
    fazenda_id = serializers.PrimaryKeyRelatedField(
        queryset=Fazenda.objects.all(), source='fazenda', write_only=True
    )

    class Meta:
        model = Talhao
        geo_field = "geometria"  # Aponta para o campo de geometria no modelo
        fields = ['id', 'nome', 'fazenda', 'fazenda_id', 'cultura_plantada', 'area_ha']
        read_only_fields = ['area_ha']

class OrdemServicoSerializer(serializers.ModelSerializer):
    # Usando StringRelatedField para legibilidade na listagem/detalhe
    produto = serializers.StringRelatedField(read_only=True)
    aeronave = serializers.StringRelatedField(read_only=True)
    talhoes = serializers.StringRelatedField(many=True, read_only=True)

    # Usando PrimaryKeyRelatedField para permitir a atualização via ID
    produto_id = serializers.PrimaryKeyRelatedField(
        queryset=Produto.objects.all(), source='produto', write_only=True
    )
    aeronave_id = serializers.PrimaryKeyRelatedField(
        queryset=Aeronave.objects.all(), source='aeronave', write_only=True
    )
    talhoes_ids = serializers.PrimaryKeyRelatedField(
        queryset=Talhao.objects.all(), source='talhoes', many=True, write_only=True
    )

    class Meta:
        model = OrdemServico
        fields = [
            'id', 'status', 'data_planejada', 'piloto_responsavel', 'dosagem_recomendada',
            'produto', 'aeronave', 'talhoes',
            'produto_id', 'aeronave_id', 'talhoes_ids',
            'area_planejada_ha', 'volume_necessario_litros', 'custo_total_estimado'
        ]
        read_only_fields = ['area_planejada_ha', 'volume_necessario_litros', 'custo_total_estimado']


class AplicacaoSerializer(GeoFeatureModelSerializer):
    """ Serializador para o modelo Aplicacao com suporte a GeoJSON. """
    ordem_servico = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = Aplicacao
        # Teremos dois campos de geometria, mas o GeoFeatureModelSerializer só pode ter um principal.
        # Vamos escolher a geometria_aplicada como o principal para visualização.
        geo_field = "geometria_aplicada"
        fields = [
            'id', 'ordem_servico', 'log_arquivo_url',
            'area_correta_ha', 'area_desperdicio_ha', 'area_falha_ha', 'area_sobreposicao_ha',
            'geometria_voo' # Incluído como um campo normal (será WKT por padrão)
        ]
        read_only_fields = [
            'area_correta_ha', 'area_desperdicio_ha', 'area_falha_ha', 'area_sobreposicao_ha'
        ]

class EstoqueProdutoSerializer(serializers.ModelSerializer):
    """ Serializador para o modelo de Estoque. """
    produto = serializers.StringRelatedField(read_only=True)
    fazenda = serializers.StringRelatedField(read_only=True)

    produto_id = serializers.PrimaryKeyRelatedField(
        queryset=Produto.objects.all(), source='produto', write_only=True
    )
    fazenda_id = serializers.PrimaryKeyRelatedField(
        queryset=Fazenda.objects.all(), source='fazenda', write_only=True
    )

    class Meta:
        model = EstoqueProduto
        fields = [
            'id', 'produto', 'fazenda', 'quantidade_litros', 'data_atualizacao',
            'produto_id', 'fazenda_id'
        ]
        read_only_fields = ['data_atualizacao']
