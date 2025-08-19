from django.contrib.gis.db import models
from django.contrib.auth.models import AbstractUser

# Etapa 2: Estrutura Técnica -> Banco de Dados -> Estrutura de Tabelas Sugerida
# E também incorporando os campos da Etapa 4

class Usuario(AbstractUser):
    """
    Modelo de usuário customizado para estender o padrão do Django.
    O AbstractUser já inclui: username, first_name, last_name, email, password, etc.
    Adicionamos o firebase_uid conforme solicitado.
    """
    firebase_uid = models.CharField(max_length=255, unique=True, null=True, blank=True)
    # Outros campos podem ser adicionados conforme necessário

    def __str__(self):
        return self.username

class Fazenda(models.Model):
    """ Modelo para representar uma fazenda. """
    nome = models.CharField(max_length=255)
    proprietario = models.ForeignKey(Usuario, on_delete=models.CASCADE, related_name="fazendas")
    # Campos da Etapa 4
    cidade = models.CharField(max_length=255, blank=True)
    estado = models.CharField(max_length=2, blank=True)

    def __str__(self):
        return self.nome

class Talhao(models.Model):
    """ Modelo para os talhões (áreas de plantio). """
    nome = models.CharField(max_length=255)
    fazenda = models.ForeignKey(Fazenda, on_delete=models.CASCADE, related_name="talhoes")
    # Usando PolygonField do GeoDjango para armazenar a geometria do talhão.
    geometria = models.PolygonField()
    # Campos da Etapa 4
    cultura_plantada = models.CharField(max_length=100, blank=True)

    @property
    def area_ha(self):
        # A área é calculada em metros quadrados, então convertemos para hectares.
        return self.geometria.area / 10000

    def __str__(self):
        return f"{self.nome} ({self.fazenda.nome})"

class Produto(models.Model):
    """ Modelo para os produtos químicos a serem aplicados. """
    nome = models.CharField(max_length=255, unique=True)
    ingrediente_ativo = models.CharField(max_length=255, blank=True)
    # Módulo Financeiro
    custo_por_litro = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.0, help_text="Custo do produto em R$ por litro."
    )

    def __str__(self):
        return self.nome

class Aeronave(models.Model):
    """ Modelo para as aeronaves, adicionado a partir da Etapa 4. """
    prefixo = models.CharField(max_length=10, unique=True)
    modelo = models.CharField(max_length=100)
    largura_faixa_aplicacao = models.FloatField(help_text="Largura da faixa de aplicação em metros.")
    # Módulo Financeiro
    custo_hora_voo = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.0, help_text="Custo da hora de voo em R$."
    )

    def __str__(self):
        return self.prefixo

class OrdemServico(models.Model):
    """ Modelo para a Ordem de Serviço (OS). """
    STATUS_CHOICES = [
        ('PLANEJADA', 'Planejada'),
        ('EM_EXECUCAO', 'Em Execução'),
        ('CONCLUIDA', 'Concluída'),
        ('CANCELADA', 'Cancelada'),
    ]

    # Relacionamentos
    talhoes = models.ManyToManyField(Talhao, related_name="ordens_servico")
    produto = models.ForeignKey(Produto, on_delete=models.PROTECT)
    aeronave = models.ForeignKey(Aeronave, on_delete=models.PROTECT)

    # Informações da OS
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PLANEJADA')
    data_planejada = models.DateField()
    piloto_responsavel = models.CharField(max_length=255, blank=True)
    dosagem_recomendada = models.FloatField(help_text="Dosagem do produto em litros por hectare (L/ha).")

    # Cálculos (preenchidos no momento do salvamento)
    area_planejada_ha = models.FloatField(blank=True, null=True, help_text="Área total planejada em hectares.")
    volume_necessario_litros = models.FloatField(blank=True, null=True, help_text="Volume de calda total necessário em litros.")

    # Módulo Financeiro
    custo_total_estimado = models.DecimalField(
        max_digits=10, decimal_places=2, blank=True, null=True, help_text="Custo total estimado da operação em R$."
    )

    def __str__(self):
        return f"OS #{self.id} - {self.data_planejada}"

    def calcular_totais(self):
        """
        Calcula a área planejada, volume necessário e custo estimado.
        Este método deve ser chamado após os talhões serem associados.
        """
        total_area_m2 = sum(talhao.geometria.area for talhao in self.talhoes.all())
        self.area_planejada_ha = total_area_m2 / 10000

        if self.area_planejada_ha and self.dosagem_recomendada:
            self.volume_necessario_litros = self.area_planejada_ha * self.dosagem_recomendada

        if self.volume_necessario_litros and self.produto.custo_por_litro:
            custo_produto = self.volume_necessario_litros * float(self.produto.custo_por_litro)
            # Placeholder para custo de voo. Uma estimativa melhor precisaria do tempo de voo.
            # Por enquanto, vamos considerar apenas o custo do produto.
            self.custo_total_estimado = custo_produto

    def save(self, *args, **kwargs):
        # O cálculo é complexo porque os talhões são um ManyToManyField.
        # O ideal é chamar um método de cálculo separado após salvar a relação m2m.
        # Por simplicidade aqui, vamos deixar o cálculo para ser acionado manualmente
        # ou por um sinal após a relação m2m ser alterada.
        # A lógica está no método `calcular_totais`.
        super().save(*args, **kwargs)


class Aplicacao(models.Model):
    """ Modelo para armazenar os dados de uma aplicação de voo executada. """
    ordem_servico = models.OneToOneField(OrdemServico, on_delete=models.CASCADE, related_name="aplicacao")
    log_arquivo_url = models.URLField(max_length=500, help_text="URL para o arquivo de log bruto no serviço de armazenamento.")

    # Geometrias processadas
    geometria_voo = models.LineStringField(help_text="A rota exata do voo extraída do log.")
    geometria_aplicada = models.PolygonField(help_text="O polígono da área efetivamente aplicada (rota + largura da faixa).")

    # Métricas calculadas (Passo 4 do detalhamento)
    area_correta_ha = models.FloatField(blank=True, null=True, help_text="Área aplicada dentro do alvo (ha).")
    area_desperdicio_ha = models.FloatField(blank=True, null=True, help_text="Área aplicada fora do alvo (ha).")
    area_falha_ha = models.FloatField(blank=True, null=True, help_text="Área do alvo não coberta (ha).")
    area_sobreposicao_ha = models.FloatField(blank=True, null=True, help_text="Área de sobreposição interna (ha).")

    def __str__(self):
        return f"Aplicação da OS #{self.ordem_servico.id}"

    def save(self, *args, **kwargs):
        # Lógica de baixa de estoque
        # Isso é uma simplificação. Em um sistema real, teríamos que garantir
        # que isso só rode uma vez e que a OS foi de fato concluída.

        # Só executa na criação de uma nova aplicação
        if self._state.adding:
            os = self.ordem_servico
            volume_gasto = os.volume_necessario_litros or 0

            if volume_gasto > 0:
                # A OS pode ter talhões de fazendas diferentes? O modelo permite.
                # Vamos assumir por agora que todos os talhões são da mesma fazenda
                # para simplificar a lógica de estoque.
                primeiro_talhao = os.talhoes.first()
                if primeiro_talhao:
                    fazenda_da_os = primeiro_talhao.fazenda

                    estoque, created = EstoqueProduto.objects.get_or_create(
                        produto=os.produto,
                        fazenda=fazenda_da_os,
                        defaults={'quantidade_litros': 0}
                    )

                    estoque.quantidade_litros -= volume_gasto
                    estoque.save()

            # Marcar a OS como concluída
            os.status = 'CONCLUIDA'
            os.save()

        super().save(*args, **kwargs)


class EstoqueProduto(models.Model):
    """ Modelo para o inventário de produtos por fazenda. """
    produto = models.ForeignKey(Produto, on_delete=models.CASCADE, related_name="estoques")
    fazenda = models.ForeignKey(Fazenda, on_delete=models.CASCADE, related_name="estoques")
    quantidade_litros = models.FloatField(default=0.0, help_text="Quantidade disponível em litros.")
    data_atualizacao = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('produto', 'fazenda')
        verbose_name = "Estoque de Produto"
        verbose_name_plural = "Estoques de Produtos"

    def __str__(self):
        return f"Estoque de {self.produto.nome} na {self.fazenda.nome}: {self.quantidade_litros} L"
