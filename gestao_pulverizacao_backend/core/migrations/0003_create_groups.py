from django.db import migrations

def create_groups(apps, schema_editor):
    """
    Cria os grupos de usuários padrão no banco de dados.
    """
    Group = apps.get_model('auth', 'Group')

    groups_to_create = [
        'Administrador',
        'Gerente de Fazenda',
        'Piloto',
    ]

    for group_name in groups_to_create:
        Group.objects.get_or_create(name=group_name)

class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_aeronave_custo_hora_voo_and_more'),
    ]

    operations = [
        migrations.RunPython(create_groups),
    ]
